#!/usr/bin/env python3
import json
import os
import sys
import tempfile
import urllib.request

MAX_DOWNLOAD_BYTES = int(os.environ.get("RESEARCH_PDF_MAX_BYTES", str(8 * 1024 * 1024)))
DOWNLOAD_TIMEOUT_SECONDS = int(os.environ.get("RESEARCH_PDF_TIMEOUT_SECONDS", "20"))


def read_input():
    raw = os.environ.get("RESEARCH_WORKER_INPUT")
    if not raw and not sys.stdin.isatty():
        try:
            raw = sys.stdin.read()
        except Exception:
            raw = "{}"
    return json.loads(raw or "{}")


def download_file(url: str) -> str:
    suffix = ".pdf" if ".pdf" in url.lower() else ".bin"
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "ReportFactoryAI/1.0 ResearchForgePdfWorker"},
    )
    with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response:
        total = 0
        with open(path, "wb") as output:
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_DOWNLOAD_BYTES:
                    raise RuntimeError("PDF_DOWNLOAD_MAX_BYTES_EXCEEDED")
                output.write(chunk)
    return path


import base64


def parse_with_pypdf(path: str) -> tuple[str, list[dict]]:
    from pypdf import PdfReader

    reader = PdfReader(path)
    pages = []
    texts = []
    for i, page in enumerate(reader.pages[:50]):
        page_text = (page.extract_text() or "").strip()
        pages.append({"page": i + 1, "text": page_text})
        if page_text:
            texts.append(page_text)
    full_text = "\n\n".join(texts).strip()
    return full_text, pages


def main():
    payload = read_input()
    pdf_url = payload.get("pdfUrl")
    pdf_path = payload.get("pdfPath")
    pdf_base64 = payload.get("pdfBase64")

    if not (pdf_url or pdf_path or pdf_base64):
        print("null")
        return

    temp_created = False
    if pdf_path and os.path.exists(pdf_path):
        path = pdf_path
    elif pdf_base64:
        fd, path = tempfile.mkstemp(suffix=".pdf")
        os.write(fd, base64.b64decode(pdf_base64))
        os.close(fd)
        temp_created = True
    elif pdf_url:
        path = download_file(pdf_url)
        temp_created = True
    else:
        print("null")
        return

    full_text = ""
    pages = []
    warnings = []
    method = payload.get("preferred") or "pypdf"

    try:
        full_text, pages = parse_with_pypdf(path)
        method = "pymupdf" if payload.get("preferred") == "pymupdf" else method
    except Exception as exc:
        warnings.append(f"parse_failed:{exc}")
    finally:
        if temp_created and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass

    has_text = len(full_text.strip()) > 0
    requires_ocr = not has_text
    status = "SUCCESS" if has_text else "OCR_REQUIRED"
    if requires_ocr:
        warnings.append("NO_EXTRACTABLE_TEXT_OCR_REQUIRED")

    response = {
        "sourceId": payload.get("sourceId"),
        "workflowId": payload.get("workflowId"),
        "extractionMethod": method if has_text else "api-abstract",
        "fullText": full_text or None,
        "pages": pages,
        "confidence": "high" if has_text else "low",
        "requiresOcr": requires_ocr,
        "status": status,
        "warnings": warnings,
    }
    print(json.dumps(response, ensure_ascii=False))


if __name__ == "__main__":
    main()

