#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON_DIR="$ROOT_DIR/python"
VENV_DIR="$PYTHON_DIR/.venv-research"

status_line() {
  printf '%-24s %s\n' "$1" "$2"
}

py_check() {
  local module="$1"
  if [ -d "$VENV_DIR" ]; then
    # shellcheck disable=SC1091
    . "$VENV_DIR/bin/activate"
  fi
  python3 - <<PY >/dev/null 2>&1
import importlib
importlib.import_module("$module")
PY
}

url_check() {
  local url="$1"
  curl -fsS --max-time 5 "$url" >/dev/null 2>&1
}

status_line "OpenAlex API" "$(url_check "${OPENALEX_WORKS_URL:-https://api.openalex.org/works}" && echo OK || echo Failed)"
status_line "Crossref API" "$(url_check "${CROSSREF_WORKS_URL:-https://api.crossref.org/works}" && echo OK || echo Failed)"
if [ -n "${SEMANTIC_SCHOLAR_API_KEY:-}" ]; then
  status_line "Semantic Scholar" "$(url_check "${SEMANTIC_SCHOLAR_SEARCH_URL:-https://api.semanticscholar.org/graph/v1/paper/search}" && echo OK || echo Failed)"
else
  status_line "Semantic Scholar" "Missing API key"
fi
status_line "arXiv" "$(url_check "${ARXIV_API_URL:-https://export.arxiv.org/api/query}" && echo OK || echo Failed)"
status_line "DOAJ" "${ENABLE_DOAJ:-false}"
status_line "CORE" "${ENABLE_CORE:-false}"
status_line "Unpaywall" "${ENABLE_UNPAYWALL:-false}"
status_line "GROBID" "$(url_check "${GROBID_URL:-http://localhost:8070}/api/isalive" && echo OK || echo 'Not running')"
status_line "Tika" "$(url_check "${TIKA_URL:-http://localhost:9998}" && echo OK || echo 'Not running')"
status_line "PyMuPDF" "$(py_check fitz && echo OK || echo Missing)"
status_line "pdfminer.six" "$(py_check pdfminer && echo OK || echo Missing)"
status_line "pdfplumber" "$(py_check pdfplumber && echo OK || echo Missing)"
status_line "pypdf" "$(py_check pypdf && echo OK || echo Missing)"
status_line "Tesseract" "$(command -v tesseract >/dev/null 2>&1 && echo Optional || echo Missing)"
status_line "PaddleOCR" "$(py_check paddleocr && echo Optional || echo 'Optional / Not installed')"
status_line "fastText" "$(py_check fasttext && echo Optional || echo 'Optional / Not installed')"
status_line "multilingual-e5" "${ENABLE_MULTILINGUAL_E5:-false}"
status_line "Qdrant" "$(url_check "${QDRANT_URL:-http://localhost:6333}" && echo OK || echo 'Optional / Not running')"
