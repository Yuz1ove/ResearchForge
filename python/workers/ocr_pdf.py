#!/usr/bin/env python3
import json
import os


def main():
    payload = json.loads(os.environ.get("RESEARCH_WORKER_INPUT", "{}"))
    print(
        json.dumps(
            {
                "sourceId": payload.get("sourceId"),
                "workflowId": payload.get("workflowId"),
                "extractionMethod": payload.get("preferred", "tesseract"),
                "confidence": "low",
                "requiresOcr": True,
                "warnings": [
                    "OCR worker is optional and currently returns a placeholder unless OCR dependencies are installed."
                ],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
