#!/usr/bin/env python3
import json
import os
import urllib.request
from bs4 import BeautifulSoup


def main():
    payload = json.loads(os.environ.get("RESEARCH_WORKER_INPUT", "{}"))
    url = payload.get("url")
    if not url:
        print("null")
        return

    html = urllib.request.urlopen(url, timeout=20).read().decode("utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")
    text = " ".join(part.strip() for part in soup.stripped_strings)
    print(
        json.dumps(
            {
                "sourceId": payload.get("sourceId"),
                "workflowId": payload.get("workflowId"),
                "extractionMethod": "readable-html",
                "fullText": text[:20000],
                "confidence": "medium" if text else "low",
                "warnings": [] if text else ["web extraction returned empty text"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
