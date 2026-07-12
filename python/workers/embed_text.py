#!/usr/bin/env python3
import json
import os


def main():
    payload = json.loads(os.environ.get("RESEARCH_WORKER_INPUT", "{}"))
    text = payload.get("text", "")
    vector = [float((ord(char) % 31) / 30.0) for char in text[:32]]
    print(
        json.dumps(
            {
                "modelName": payload.get("modelName", "deterministic-placeholder"),
                "vectorDimensions": len(vector),
                "embedding": vector,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
