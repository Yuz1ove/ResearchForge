#!/usr/bin/env python3
"""Render a ResearchForge DOCX with the OFL CJK font embedded in that DOCX."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

from pypdf import PdfReader


WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_docx", type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--renderer", required=True, type=Path)
    parser.add_argument("--expected-text", action="append", default=[])
    parser.add_argument("--emit-json", type=Path)
    return parser.parse_args()


def _embedded_regular_font(docx_path: Path) -> tuple[str, bytes]:
    with ZipFile(docx_path, "r") as archive:
        fonts = ET.fromstring(archive.read("word/fontTable.xml"))
        relationships = ET.fromstring(archive.read("word/_rels/fontTable.xml.rels"))
        targets = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in relationships.findall(f"{{{REL_NS}}}Relationship")
        }
        for font in fonts.findall(f"{{{WORD_NS}}}font"):
            embedded = font.find(f"{{{WORD_NS}}}embedRegular")
            if embedded is None:
                continue
            relation_id = embedded.attrib.get(f"{{{OFFICE_REL_NS}}}id", "")
            key = embedded.attrib.get(f"{{{WORD_NS}}}fontKey", "").strip("{}").replace("-", "")
            target = targets.get(relation_id, "")
            if not target or len(key) != 32:
                continue
            archive_path = target if target.startswith("word/") else f"word/{target}"
            decoded = bytearray(archive.read(archive_path))
            key_bytes = bytes.fromhex(key)[::-1]
            for index in range(min(32, len(decoded))):
                decoded[index] ^= key_bytes[index % len(key_bytes)]
            if bytes(decoded[:4]) not in (b"\x00\x01\x00\x00", b"OTTO", b"true"):
                raise RuntimeError("Embedded OOXML font did not decode to a real sfnt font.")
            return font.attrib.get(f"{{{WORD_NS}}}name", "ResearchForge CJK"), bytes(decoded)
    raise RuntimeError("DOCX does not contain an embedded regular CJK font.")


def _fontconfig(font_dir: Path, cache_dir: Path) -> str:
    return f"""<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>{font_dir}</dir>
  <cachedir>{cache_dir}</cachedir>
  <config><rescan><int>0</int></rescan></config>
</fontconfig>
"""


def _pdf_fonts(reader: PdfReader) -> list[str]:
    names: set[str] = set()
    for page in reader.pages:
        resources = page.get("/Resources") or {}
        for font_reference in (resources.get("/Font") or {}).values():
            font = font_reference.get_object()
            if font.get("/BaseFont"):
                names.add(str(font["/BaseFont"]).lstrip("/"))
            for descendant_reference in font.get("/DescendantFonts") or []:
                descendant = descendant_reference.get_object()
                if descendant.get("/BaseFont"):
                    names.add(str(descendant["/BaseFont"]).lstrip("/"))
    return sorted(names)


def main() -> int:
    args = _arguments()
    input_docx = args.input_docx.resolve()
    output_dir = args.output_dir.resolve()
    renderer = args.renderer.resolve()
    if not input_docx.is_file() or input_docx.suffix.lower() != ".docx":
        raise SystemExit(f"Input DOCX not found: {input_docx}")
    if not renderer.is_file():
        raise SystemExit(f"Canonical render_docx.py not found: {renderer}")
    output_dir.mkdir(parents=True, exist_ok=True)

    family, sfnt = _embedded_regular_font(input_docx)
    with tempfile.TemporaryDirectory(prefix="researchforge-cjk-render-", dir="/private/tmp") as temp:
        work = Path(temp)
        font_dir = work / "fonts"
        cache_dir = work / "font-cache"
        font_dir.mkdir()
        cache_dir.mkdir()
        (font_dir / "researchforge-noto-sans-tc.ttf").write_bytes(sfnt)
        config = work / "fonts.conf"
        config.write_text(_fontconfig(font_dir, cache_dir), encoding="utf-8")
        environment = os.environ.copy()
        environment.update({
            "FONTCONFIG_FILE": str(config),
            "FONTCONFIG_PATH": str(work),
            "SAL_FONTPATH": str(font_dir),
            "TMPDIR": "/private/tmp",
            "TMP": "/private/tmp",
            "TEMP": "/private/tmp",
        })
        subprocess.run([
            sys.executable,
            str(renderer),
            str(input_docx),
            "--output_dir",
            str(output_dir),
            "--emit_pdf",
        ], check=True, env=environment)

    pdf_path = output_dir / f"{input_docx.stem}.pdf"
    page_images = sorted(output_dir.glob("page-*.png"))
    if not pdf_path.is_file() or not page_images:
        raise RuntimeError("Renderer did not emit both PDF and page PNGs.")
    reader = PdfReader(pdf_path)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    missing = [value for value in args.expected_text if value not in text]
    fonts = _pdf_fonts(reader)
    noto_visible = any(
        "NotoSansTC" in font.replace(" ", "") or "NotoSansCJK" in font.replace(" ", "")
        for font in fonts
    )
    result = {
        "schemaVersion": "researchforge-docx-cjk-render/v1",
        "inputDocx": str(input_docx),
        "renderedPdf": str(pdf_path),
        "renderedPages": len(page_images),
        "embeddedFontFamily": family,
        "pdfFonts": fonts,
        "embeddedFontVisibleInPdf": noto_visible,
        "expectedText": args.expected_text,
        "missingExpectedText": missing,
        "status": "pass" if noto_visible and not missing else "blocked",
    }
    output_json = (args.emit_json or output_dir / "cjk-render-validation.json").resolve()
    output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
