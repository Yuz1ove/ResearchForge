#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON_DIR="$ROOT_DIR/python"
VENV_DIR="$PYTHON_DIR/.venv-research"

log() {
  printf '%s\n' "$1"
}

ensure_venv() {
  if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR" || {
      log "Failed to create Python venv at $VENV_DIR"
      return 1
    }
  fi
  # shellcheck disable=SC1091
  . "$VENV_DIR/bin/activate"
  python -m pip install --upgrade pip >/dev/null 2>&1 || true
}

install_requirements() {
  local file="$1"
  if [ ! -f "$file" ]; then
    log "Missing requirements file: $file"
    return 1
  fi
  python -m pip install -r "$file" || {
    log "Install failed for $file; continuing for fallback compatibility."
    return 1
  }
}

install_core() {
  ensure_venv || return 1
  install_requirements "$PYTHON_DIR/requirements-research-core.txt"
}

install_pdf() {
  ensure_venv || return 1
  install_requirements "$PYTHON_DIR/requirements-research-pdf.txt"
  log "Optional Docker services for PDF parsers:"
  log "  docker compose -f tools/research/docker-compose.research-tools.yml --profile pdf up -d"
}

install_ocr() {
  ensure_venv || return 1
  install_requirements "$PYTHON_DIR/requirements-research-ocr.txt"
  if command -v brew >/dev/null 2>&1; then
    brew list tesseract >/dev/null 2>&1 || {
      log "Homebrew detected. Run 'brew install tesseract' manually if OCR is needed."
    }
  fi
}

install_experimental() {
  ensure_venv || return 1
  install_requirements "$PYTHON_DIR/requirements-research-experimental.txt"
}

install_vector() {
  ensure_venv || return 1
  python -m pip install sentence-transformers fasttext-wheel || {
    log "Vector install failed; continuing."
    return 1
  }
  log "Optional Docker service for vector search:"
  log "  docker compose -f tools/research/docker-compose.research-tools.yml --profile vector up -d"
}

install_web() {
  ensure_venv || return 1
  python -m pip install scrapy playwright crawl4ai trafilatura readability-lxml || {
    log "Web extraction install failed; continuing."
    return 1
  }
  log "Playwright package installed. Browser binaries are intentionally not auto-installed."
}

confirm_heavy_install() {
  log "This will attempt to install heavy optional tools: pdf, ocr, experimental, vector, web."
  log "Some packages may download large models or require extra system dependencies."
  printf 'Continue? [y/N] '
  read -r answer
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    *) log "Cancelled."; return 1 ;;
  esac
}

mode="${1:-}"

if [ -z "$mode" ]; then
  log "Usage: ./tools/research/install-research-tools.sh {core|pdf|ocr|experimental|vector|web|all}"
  exit 1
fi

case "$mode" in
  core) install_core ;;
  pdf) install_pdf ;;
  ocr) install_ocr ;;
  experimental) install_experimental ;;
  vector) install_vector ;;
  web) install_web ;;
  all)
    confirm_heavy_install || exit 1
    install_core || true
    install_pdf || true
    install_ocr || true
    install_experimental || true
    install_vector || true
    install_web || true
    ;;
  *)
    log "Unknown mode: $mode"
    exit 1
    ;;
esac
