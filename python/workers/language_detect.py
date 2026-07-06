#!/usr/bin/env python3
import json
import os
import re


def main():
    payload = json.loads(os.environ.get("RESEARCH_WORKER_INPUT", "{}"))
    text = payload.get("text", "")
    if re.search(r"[\u4e00-\u9fff]", text):
        result = {"language": "zh", "confidence": 0.8}
    elif re.search(r"[A-Za-z]", text):
        result = {"language": "en", "confidence": 0.7}
    else:
        result = {"language": "unknown", "confidence": 0.1}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
