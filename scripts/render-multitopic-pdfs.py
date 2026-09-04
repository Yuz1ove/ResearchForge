#!/usr/bin/env python3
"""Rasterize every completed acceptance PDF and build all-page QA contact sheets."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader


SLUGS = [
    "case-a",
    "retrieval-practice-vs-rereading",
    "hiit-vs-mict",
    "intermittent-fasting-vs-calorie-restriction",
    "pm25-lung-function",
    "green-space-mental-health",
    "genai-writing-education",
    "rag-vs-finetuning",
    "low-resource-multilingual-llm",
    "minimum-wage-youth-employment",
    "microplastics-human-health",
]


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_contact_sheet(pages: list[Path], output: Path, slug: str) -> None:
    columns = 3
    page_width = 380
    gutter = 15
    label_height = 24
    with Image.open(pages[0]) as first:
        page_height = round(first.height * page_width / first.width)
    rows = (len(pages) + columns - 1) // columns
    canvas = Image.new(
        "RGB",
        (
            columns * page_width + (columns + 1) * gutter,
            rows * (page_height + label_height) + (rows + 1) * gutter,
        ),
        "#e5e5e5",
    )
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=12)
    for index, page_path in enumerate(pages):
        row, column = divmod(index, columns)
        x = gutter + column * (page_width + gutter)
        y = gutter + row * (page_height + label_height)
        with Image.open(page_path).convert("RGB") as page:
            thumbnail = page.resize((page_width, page_height), Image.Resampling.LANCZOS)
        canvas.paste(thumbnail, (x, y + label_height))
        draw.text((x, y + 4), f"{slug} p{index + 1}", fill="#111111", font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, "PNG", optimize=True)


def main() -> int:
    if len(sys.argv) not in {2, 3}:
        raise SystemExit(
            "usage: render-multitopic-pdfs.py ARTIFACT_ROOT [comma-separated-cases]"
        )
    root = Path(sys.argv[1]).resolve()
    requested_slugs = (
        [slug.strip() for slug in sys.argv[2].split(",") if slug.strip()]
        if len(sys.argv) == 3
        else SLUGS
    )
    unknown_slugs = sorted(set(requested_slugs) - set(SLUGS))
    if unknown_slugs:
        raise RuntimeError(f"unknown cases: {', '.join(unknown_slugs)}")
    renderer = shutil.which("pdftoppm")
    if not renderer:
        raise RuntimeError("pdftoppm is required")
    total = 0
    for slug in requested_slugs:
        pdf = root / slug / "report.pdf"
        render_dir = root / "renders" / slug
        render_dir.mkdir(parents=True, exist_ok=True)
        for stale in render_dir.glob("page-*.png"):
            stale.unlink()
        subprocess.run(
            [renderer, "-png", "-r", "108", str(pdf), str(render_dir / "page")],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        raw_pages = sorted(
            render_dir.glob("page-*.png"),
            key=lambda path: int(path.stem.rsplit("-", 1)[-1]),
        )
        pages = []
        for index, raw in enumerate(raw_pages, start=1):
            target = render_dir / f"page-{index:03d}.png"
            if raw != target:
                raw.rename(target)
            pages.append(target)
        reader = PdfReader(pdf)
        texts = [(page.extract_text() or "") for page in reader.pages]
        if len(pages) != len(texts):
            raise RuntimeError(f"{slug}: rendered {len(pages)} of {len(texts)} pages")
        records = [
            {
                "page": index,
                "textCharacters": len(text.strip()),
                "blank": len(text.strip()) < 20,
                "render": f"renders/{slug}/{page.name}",
            }
            for index, (page, text) in enumerate(zip(pages, texts), start=1)
        ]
        contact = root / "visual-qa" / f"{slug}-contact-sheet.png"
        build_contact_sheet(pages, contact, slug)
        write_json(
            root / "visual-qa" / f"{slug}-RENDERED-PAGE-QA.json",
            {
                "schemaVersion": "researchforge-rendered-page-qa/v1",
                "case": slug,
                "pdfPages": len(texts),
                "renderedPages": len(pages),
                "allPagesRendered": len(pages) == len(texts),
                "blankPageCount": sum(1 for record in records if record["blank"]),
                "minimumTextCharacters": min(record["textCharacters"] for record in records),
                "contactSheet": f"visual-qa/{contact.name}",
                "pages": records,
            },
        )
        total += len(pages)
        print(f"{slug}: {len(pages)} pages")
    print(f"total: {total} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
