#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["Pillow==12.2.0"]
# ///
"""Build the fixed ImageGen artifact icon pack from six declared family sheets."""

from __future__ import annotations

import argparse
import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from split_atlas import border_key, fit_square


RGB = tuple[int, int, int]
OUTPUT_SIZE = 128
PADDING = 4
CHROMA_DISTANCE = 48
GRID_COLUMNS = 3
GRID_ROWS = 2
FAMILY_SIZE = GRID_COLUMNS * GRID_ROWS
KEBAB_CASE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
PROJECT_ROOT = Path(__file__).resolve().parents[1]

EXPECTED = (
    "twin-chamber",
    "deadeye",
    "last-bell",
    "grave-echo",
    "fan-the-phantom",
    "dealers-cut",
    "halo-chamber",
    "ghost-sight",
    "pinball",
    "wailing-lead",
    "undertakers-return",
    "comet-spur",
    "shotgun",
    "hollow-point",
    "bone-orchard",
    "grave-bloom",
    "soul-harvester",
    "bootleg-mint",
    "coldcaster",
    "cinder-gospel",
    "wanted-brand",
    "widows-ledger",
    "ectoplasm-snare",
    "hex-bell",
    "spectral-bullets",
    "tesla-bullets",
    "big-iron",
    "ghost-posse",
    "ectoplasmic-wake",
    "crossfire-covenant",
    "recoil-boots",
    "stillwater",
    "dustline-duel",
    "bonanza-clip",
    "last-gasp-locket",
    "undertakers-coat",
)


@dataclass(frozen=True)
class FamilyDeclaration:
    names: tuple[str, ...]
    columns: int
    rows: int
    chroma: RGB


ICON_FAMILIES = (
    FamilyDeclaration(EXPECTED[0:6], GRID_COLUMNS, GRID_ROWS, (6, 248, 6)),
    FamilyDeclaration(EXPECTED[6:12], GRID_COLUMNS, GRID_ROWS, (249, 5, 248)),
    FamilyDeclaration(EXPECTED[12:18], GRID_COLUMNS, GRID_ROWS, (249, 4, 230)),
    FamilyDeclaration(EXPECTED[18:24], GRID_COLUMNS, GRID_ROWS, (245, 5, 243)),
    FamilyDeclaration(EXPECTED[24:30], GRID_COLUMNS, GRID_ROWS, (246, 4, 214)),
    FamilyDeclaration(EXPECTED[30:36], GRID_COLUMNS, GRID_ROWS, (248, 5, 233)),
)

PRODUCTION_SOURCES = tuple(
    PROJECT_ROOT / "tmp" / "imagegen" / "artifacts" / f"row-{index}.png"
    for index in range(1, 7)
)
PRODUCTION_OUTPUT = PROJECT_ROOT / "public" / "assets" / "generated" / "artifacts"
PRODUCTION_CONTACT_SHEET = PROJECT_ROOT / "tmp" / "imagegen" / "artifacts" / "contact-sheet.png"


def color_distance_squared(left: RGB, right: RGB) -> int:
    return sum((a - b) ** 2 for a, b in zip(left, right, strict=True))


def is_declared_chroma(pixel: tuple[int, int, int, int], chroma: RGB) -> bool:
    return pixel[3] > 0 and color_distance_squared(pixel[:3], chroma) <= CHROMA_DISTANCE**2


def border_pixels(image: Image.Image) -> list[tuple[int, int, int, int]]:
    pixels = image.load()
    width, height = image.size
    return (
        [pixels[x, 0] for x in range(width)]
        + [pixels[x, height - 1] for x in range(width)]
        + [pixels[0, y] for y in range(1, height - 1)]
        + [pixels[width - 1, y] for y in range(1, height - 1)]
    )


def verify_declared_border(image: Image.Image, chroma: RGB) -> None:
    sampled = border_key(image)
    border = border_pixels(image)
    if (
        color_distance_squared(sampled, chroma) > CHROMA_DISTANCE**2
        or any(pixel[3] != 255 or not is_declared_chroma(pixel, chroma) for pixel in border)
    ):
        raise ValueError(
            f"declared chroma does not match sheet border: declared {chroma}, sampled {sampled}"
        )


def split_cells(image: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    if columns < 1 or rows < 1:
        raise ValueError("columns and rows must be positive")
    if image.width % columns or image.height % rows:
        raise ValueError(
            f"sheet dimensions must divide exactly by {columns} columns and {rows} rows"
        )
    width, height = image.width // columns, image.height // rows
    return [
        image.crop((column * width, row * height, (column + 1) * width, (row + 1) * height))
        for row in range(rows)
        for column in range(columns)
    ]


def remove_declared_chroma(image: Image.Image, chroma: RGB) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = list(rgba.get_flattened_data())
    rgba.putdata(
        [(0, 0, 0, 0) if is_declared_chroma(pixel, chroma) else pixel for pixel in pixels]
    )
    return rgba


def has_transparent_padding(image: Image.Image, padding: int = PADDING) -> bool:
    bounds = image.getchannel("A").getbbox()
    return bounds is not None and (
        bounds[0] >= padding
        and bounds[1] >= padding
        and bounds[2] <= image.width - padding
        and bounds[3] <= image.height - padding
    )


def validate_family_names(names: Sequence[str]) -> None:
    if len(names) != FAMILY_SIZE:
        raise ValueError("artifact family must contain exactly six names")
    if len(set(names)) != FAMILY_SIZE or any(not KEBAB_CASE.fullmatch(name) for name in names):
        raise ValueError("artifact names must be unique kebab-case catalog IDs")


def normalize_family(
    sheet: Path,
    names: Sequence[str],
    columns: int,
    rows: int,
    chroma: RGB,
) -> list[tuple[str, Image.Image]]:
    validate_family_names(names)
    if columns * rows != FAMILY_SIZE:
        raise ValueError("artifact family sheet must contain six complete cells")
    with Image.open(sheet) as source:
        source.load()
        rgba = source.convert("RGBA")
    verify_declared_border(rgba, chroma)
    cells = split_cells(rgba, columns, rows)
    if len(cells) != FAMILY_SIZE:
        raise ValueError("artifact family sheet must contain six complete cells")

    normalized: list[tuple[str, Image.Image]] = []
    for index, (name, cell) in enumerate(zip(names, cells, strict=True)):
        cleaned = remove_declared_chroma(cell, chroma)
        bounds = cleaned.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"cell is empty after chroma removal: {name}")
        if bounds[0] == 0 or bounds[1] == 0 or bounds[2] == cell.width or bounds[3] == cell.height:
            raise ValueError(f"opaque content touches cell edge: {name} at cell {index}")
        output = fit_square(cleaned, OUTPUT_SIZE)
        if output.mode != "RGBA" or output.size != (OUTPUT_SIZE, OUTPUT_SIZE):
            raise ValueError(f"normalization failed for {name}")
        if not has_transparent_padding(output):
            raise ValueError(f"normalized icon lacks transparent padding: {name}")
        normalized.append((name, output))
    return normalized


def require_unique(images: Sequence[tuple[str, Image.Image]]) -> None:
    seen: dict[bytes, str] = {}
    for name, image in images:
        pixels = image.tobytes()
        if pixels in seen:
            raise ValueError(f"duplicate normalized pixels: {seen[pixels]} and {name}")
        seen[pixels] = name


def save_images(images: Sequence[tuple[str, Image.Image]], output: Path) -> list[Path]:
    output.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for name, image in images:
        path = output / f"{name}.png"
        image.save(path)
        paths.append(path)
    return paths


def build_family(
    sheet: Path,
    names: list[str],
    output: Path,
    columns: int,
    rows: int,
    chroma: RGB,
) -> list[Path]:
    images = normalize_family(sheet, names, columns, rows, chroma)
    require_unique(images)
    return save_images(images, output)


def build_pack(
    sheets: Sequence[Path],
    output: Path,
    declarations: Sequence[FamilyDeclaration] = ICON_FAMILIES,
) -> list[Path]:
    if len(sheets) != 6 or len(declarations) != 6:
        raise ValueError("artifact pack requires six explicit source sheets and declarations")
    names = [name for declaration in declarations for name in declaration.names]
    if names != list(EXPECTED):
        raise ValueError("artifact families must preserve the exact artifact catalog order")

    images: list[tuple[str, Image.Image]] = []
    for family_index, (sheet, declaration) in enumerate(
        zip(sheets, declarations, strict=True), start=1
    ):
        try:
            images.extend(
                normalize_family(
                    sheet,
                    declaration.names,
                    declaration.columns,
                    declaration.rows,
                    declaration.chroma,
                )
            )
        except (OSError, ValueError) as error:
            raise ValueError(f"artifact family {family_index} ({sheet.name}): {error}") from error
    require_unique(images)
    return save_images(images, output)


def chroma_by_name(
    declarations: Sequence[FamilyDeclaration] = ICON_FAMILIES,
) -> dict[str, RGB]:
    return {
        name: declaration.chroma
        for declaration in declarations
        for name in declaration.names
    }


def validate_production_pack(
    output: Path,
    declarations: Sequence[FamilyDeclaration] = ICON_FAMILIES,
) -> list[str]:
    errors: list[str] = []
    expected_names = [f"{name}.png" for name in EXPECTED]
    actual_names = sorted(
        path.name
        for path in output.iterdir()
        if path.is_file() and path.suffix.lower() == ".png"
    ) if output.is_dir() else []
    if actual_names != sorted(expected_names):
        missing = sorted(set(expected_names) - set(actual_names))
        unexpected = sorted(set(actual_names) - set(expected_names))
        errors.append(f"production pack must contain exact filenames; missing={missing}, unexpected={unexpected}")

    chromas = chroma_by_name(declarations)
    seen: dict[bytes, str] = {}
    for name in EXPECTED:
        path = output / f"{name}.png"
        if not path.is_file():
            continue
        try:
            with Image.open(path) as source:
                source.load()
                mode, size = source.mode, source.size
                image = source.convert("RGBA")
        except OSError as error:
            errors.append(f"cannot decode artifact PNG {path}: {error}")
            continue
        if mode != "RGBA" or size != (OUTPUT_SIZE, OUTPUT_SIZE):
            errors.append(f"artifact must be 128 x 128 RGBA: {path}")
            continue
        if not has_transparent_padding(image):
            errors.append(f"artifact must keep a fully transparent padding band: {path}")
        if any(
            is_declared_chroma(pixel, chromas[name])
            for pixel in image.get_flattened_data()
        ):
            errors.append(f"declared chroma survived normalization: {path}")
        pixels = image.tobytes()
        if pixels in seen:
            errors.append(f"duplicate normalized pixels: {seen[pixels]} and {name}")
        else:
            seen[pixels] = name
    return errors


def checkerboard(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGBA", size, (24, 19, 28, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], 8):
        for x in range(0, size[0], 8):
            if (x // 8 + y // 8) % 2:
                draw.rectangle((x, y, x + 7, y + 7), fill=(43, 35, 48, 255))
    return image


def build_contact_sheet(paths: Sequence[Path], output: Path) -> None:
    if [path.stem for path in paths] != list(EXPECTED):
        raise ValueError("contact sheet requires the exact artifact catalog order")
    columns, rows = 6, 6
    card_width, card_height = OUTPUT_SIZE + 20, OUTPUT_SIZE + 36
    contact = checkerboard((columns * card_width + 20, rows * card_height + 20))
    draw = ImageDraw.Draw(contact)
    font = ImageFont.load_default()
    for index, path in enumerate(paths):
        column, row = index % columns, index // columns
        x, y = 10 + column * card_width, 10 + row * card_height
        with Image.open(path) as source:
            source.load()
            contact.alpha_composite(source.convert("RGBA"), (x + 10, y))
        draw.text((x + 4, y + OUTPUT_SIZE + 6), path.stem, fill=(245, 229, 192, 255), font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    contact.save(output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    for index, default in enumerate(PRODUCTION_SOURCES, start=1):
        parser.add_argument(f"--row-{index}", type=Path, default=default)
    parser.add_argument("--output", type=Path, default=PRODUCTION_OUTPUT)
    parser.add_argument("--contact-sheet", type=Path, default=PRODUCTION_CONTACT_SHEET)
    args = parser.parse_args()
    sources = [getattr(args, f"row_{index}") for index in range(1, 7)]

    outputs = build_pack(sources, args.output)
    errors = validate_production_pack(args.output)
    if errors:
        for error in errors:
            print(f"error: {error}")
        raise SystemExit(1)
    build_contact_sheet(outputs, args.contact_sheet)
    print("artifact pack validation passed")


if __name__ == "__main__":
    main()
