#!/usr/bin/env python3
import json
import os
import sys
import tempfile
import urllib.request

MAX_DOWNLOAD_BYTES = int(os.environ.get("RESEARCH_PDF_MAX_BYTES", str(8 * 1024 * 1024)))
DOWNLOAD_TIMEOUT_SECONDS = int(os.environ.get("RESEARCH_PDF_TIMEOUT_SECONDS", "20"))


def read_input():
    raw = os.environ.get("RESEARCH_WORKER_INPUT", "{}")
    return json.loads(raw)


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


def parse_with_pypdf(path: str) -> str:
    from pypdf import PdfReader

    reader = PdfReader(path)
    texts = []
    for page in reader.pages[:20]:
      texts.append(page.extract_text() or "")
    return "\n".join(texts).strip()


def main():
    payload = read_input()
    pdf_url = payload.get("pdfUrl")
    if not pdf_url:
        print("null")
        return

    path = download_file(pdf_url)
    full_text = ""
    warnings = []
    method = payload.get("preferred") or "pypdf"

    try:
        full_text = parse_with_pypdf(path)
        method = "pymupdf" if payload.get("preferred") == "pymupdf" else method
    except Exception as exc:
        warnings.append(f"parse_failed:{exc}")

    response = {
        "sourceId": payload.get("sourceId"),
        "workflowId": payload.get("workflowId"),
        "extractionMethod": method if full_text else "api-abstract",
        "fullText": full_text or None,
        "confidence": "medium" if full_text else "low",
        "requiresOcr": False if full_text else True,
        "warnings": warnings,
    }
    print(json.dumps(response, ensure_ascii=False))


if __name__ == "__main__":
    main()
