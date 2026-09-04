from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(
    "artifacts/qa/researchforge-offline-deterministic-closure-20260824T090834+0800/case-a"
)


def natural_page(path: Path) -> int:
    return int(path.stem.split("-")[-1])


def build_contact_sheet(source: Path, pattern: str, output: Path, title: str) -> None:
    pages = sorted(source.glob(pattern), key=natural_page)
    if not pages:
        raise RuntimeError(f"No pages found in {source}")

    columns = 4
    thumb_width = 320
    label_height = 34
    gutter = 20
    title_height = 58
    sample = Image.open(pages[0]).convert("RGB")
    thumb_height = round(sample.height * thumb_width / sample.width)
    rows = (len(pages) + columns - 1) // columns
    canvas = Image.new(
        "RGB",
        (
            columns * thumb_width + (columns + 1) * gutter,
            title_height + rows * (thumb_height + label_height) + (rows + 1) * gutter,
        ),
        "#edf1ef",
    )
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=20)
    label_font = ImageFont.load_default(size=16)
    draw.text((gutter, 18), title, fill="#173f3f", font=font)

    for index, page_path in enumerate(pages):
        row, column = divmod(index, columns)
        x = gutter + column * (thumb_width + gutter)
        y = title_height + gutter + row * (thumb_height + label_height + gutter)
        with Image.open(page_path).convert("RGB") as page:
            thumb = page.resize((thumb_width, thumb_height), Image.Resampling.LANCZOS)
        canvas.paste(thumb, (x, y))
        draw.rectangle((x, y, x + thumb_width - 1, y + thumb_height - 1), outline="#8aa09d")
        draw.text(
            (x, y + thumb_height + 7),
            f"Page {natural_page(page_path)} / {len(pages)}",
            fill="#173f3f",
            font=label_font,
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="PNG", optimize=True)


build_contact_sheet(
    ROOT / "docx-render-portable-v2",
    "page-*.png",
    ROOT / "DOCX-CONTACT-SHEET.png",
    "ResearchForge Case A - DOCX portable render - all 22 pages",
)
build_contact_sheet(
    ROOT / "pdf-render-v2",
    "page-*.png",
    ROOT / "PDF-CONTACT-SHEET.png",
    "ResearchForge Case A - production PDF - all 10 pages",
)
