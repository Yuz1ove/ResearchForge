from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def page_number(path: Path) -> int:
    return int(path.stem.split("-")[-1])


def build(source: Path, output: Path, title: str) -> int:
    pages = sorted(source.glob("page-*.png"), key=page_number)
    if not pages:
        raise RuntimeError(f"No rendered pages found in {source}")
    columns, width, gutter, label_height, title_height = 4, 320, 20, 34, 58
    with Image.open(pages[0]) as first:
        height = round(first.height * width / first.width)
    rows = (len(pages) + columns - 1) // columns
    canvas = Image.new(
        "RGB",
        (
            columns * width + (columns + 1) * gutter,
            title_height + rows * (height + label_height) + (rows + 1) * gutter,
        ),
        "#edf1ef",
    )
    draw = ImageDraw.Draw(canvas)
    draw.text((gutter, 18), title, fill="#173f3f", font=ImageFont.load_default(size=20))
    label_font = ImageFont.load_default(size=16)
    for index, page_path in enumerate(pages):
        row, column = divmod(index, columns)
        x = gutter + column * (width + gutter)
        y = title_height + gutter + row * (height + label_height + gutter)
        with Image.open(page_path).convert("RGB") as page:
            thumbnail = page.resize((width, height), Image.Resampling.LANCZOS)
        canvas.paste(thumbnail, (x, y))
        draw.rectangle((x, y, x + width - 1, y + height - 1), outline="#8aa09d")
        draw.text(
            (x, y + height + 7),
            f"Page {page_number(page_path)} / {len(pages)}",
            fill="#173f3f",
            font=label_font,
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="PNG", optimize=True)
    return len(pages)


parser = argparse.ArgumentParser()
parser.add_argument("--case-root", required=True, type=Path)
args = parser.parse_args()
visual = args.case_root.resolve() / "visual-qa"
pdf_pages = build(
    visual / "pdf-pages-current",
    visual / "pdf-contact-sheet-current.png",
    "ResearchForge Case A - production PDF - all pages",
)
docx_pages = build(
    visual / "docx-portable-current",
    visual / "docx-portable-contact-sheet-current.png",
    "ResearchForge Case A - portable DOCX render - all pages",
)
print(f"PDF pages: {pdf_pages}; DOCX pages: {docx_pages}")
