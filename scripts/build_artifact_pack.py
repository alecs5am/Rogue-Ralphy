#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["Pillow==12.2.0"]
# ///
"""Build the fixed ImageGen artifact, VFX, and Deadeye HUD packs."""

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

VFX = (
    "echo-flash", "burst-flash", "side-shot-flash", "bell-ring",
    "bone-fan", "grave-bloom", "soul-spirit", "coin-mint",
    "chill-mark", "ice-shatter", "burn-mark", "ember-ring",
    "wanted-mark", "ledger-mark", "hex-pulse", "hollow-explosion",
    "wave-trail", "comet-tail", "return-loop", "pinball-relay",
    "ectoplasm-pool", "ectoplasm-trail", "crossfire-pulse", "kinetic-explosion",
    "iron-moonlet", "ghost-satellite", "recoil-skid", "stillwater-ward",
    "dustline-afterimage", "gold-soul", "locket-orbital", "coat-decoy",
    "twin-weave",
)

HUD = ("ammo-echo", "dealer-cut-1", "dealer-cut-2", "dealer-cut-3")


@dataclass(frozen=True)
class FamilyDeclaration:
    names: tuple[str, ...]
    columns: int
    rows: int
    chroma: RGB


@dataclass(frozen=True)
class SpriteSheetDeclaration:
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

VFX_SHEETS = (
    SpriteSheetDeclaration(VFX[0:8], 4, 2, (249, 5, 237)),
    SpriteSheetDeclaration(VFX[8:16], 4, 2, (238, 8, 242)),
    SpriteSheetDeclaration(VFX[16:24], 4, 2, (250, 4, 249)),
    SpriteSheetDeclaration(VFX[24:32], 4, 2, (251, 4, 249)),
    SpriteSheetDeclaration(VFX[32:33], 1, 1, (249, 5, 248)),
)
HUD_SHEET = SpriteSheetDeclaration(HUD, 2, 2, (246, 5, 245))

PRODUCTION_SOURCES = tuple(
    PROJECT_ROOT / "tmp" / "imagegen" / "artifacts" / f"row-{index}.png"
    for index in range(1, 7)
)
PRODUCTION_OUTPUT = PROJECT_ROOT / "public" / "assets" / "generated" / "artifacts"
PRODUCTION_CONTACT_SHEET = PROJECT_ROOT / "tmp" / "imagegen" / "artifacts" / "contact-sheet.png"
PRODUCTION_VFX_SOURCES = (
    *(
        PROJECT_ROOT / "tmp" / "imagegen" / "effects" / f"vfx-{index}-sheet.png"
        for index in range(1, 5)
    ),
    PROJECT_ROOT / "tmp" / "imagegen" / "effects" / "twin-weave.png",
)
PRODUCTION_HUD_SOURCE = PROJECT_ROOT / "tmp" / "imagegen" / "effects" / "hud.png"
PRODUCTION_VFX_OUTPUT = PROJECT_ROOT / "public" / "assets" / "generated" / "effects" / "artifacts"
PRODUCTION_UI_OUTPUT = PROJECT_ROOT / "public" / "assets" / "generated" / "ui"
PRODUCTION_VFX_CONTACT_SHEET = PROJECT_ROOT / "tmp" / "imagegen" / "effects" / "vfx-contact-sheet.png"
PRODUCTION_HUD_CONTACT_SHEET = PROJECT_ROOT / "tmp" / "imagegen" / "effects" / "hud-contact-sheet.png"


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
    return normalize_declared_sheet(
        sheet,
        SpriteSheetDeclaration(tuple(names), columns, rows, chroma),
        OUTPUT_SIZE,
    )


def normalize_declared_sheet(
    sheet: Path,
    declaration: SpriteSheetDeclaration,
    output_size: int,
) -> list[tuple[str, Image.Image]]:
    names = declaration.names
    if len(names) != declaration.columns * declaration.rows:
        raise ValueError("declared names must match the complete sheet grid")
    if len(set(names)) != len(names) or any(not KEBAB_CASE.fullmatch(name) for name in names):
        raise ValueError("declared names must be unique kebab-case IDs")
    with Image.open(sheet) as source:
        source.load()
        rgba = source.convert("RGBA")
    verify_declared_border(rgba, declaration.chroma)
    cells = split_cells(rgba, declaration.columns, declaration.rows)

    normalized: list[tuple[str, Image.Image]] = []
    for index, (name, cell) in enumerate(zip(names, cells, strict=True)):
        cleaned = remove_declared_chroma(cell, declaration.chroma)
        bounds = cleaned.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"cell is empty after chroma removal: {name}")
        if bounds[0] == 0 or bounds[1] == 0 or bounds[2] == cell.width or bounds[3] == cell.height:
            raise ValueError(f"opaque content touches cell edge: {name} at cell {index}")
        output = fit_square(cleaned, output_size)
        if output.mode != "RGBA" or output.size != (output_size, output_size):
            raise ValueError(f"normalization failed for {name}")
        if not has_transparent_padding(output):
            raise ValueError(f"normalized sprite lacks transparent padding: {name}")
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


def build_effect_pack(
    vfx_sheets: Sequence[Path],
    hud_sheet: Path,
    vfx_output: Path,
    ui_output: Path,
    declarations: Sequence[SpriteSheetDeclaration] = VFX_SHEETS,
    hud_declaration: SpriteSheetDeclaration = HUD_SHEET,
) -> tuple[list[Path], list[Path]]:
    if len(vfx_sheets) != len(declarations):
        raise ValueError("effect pack requires five explicit VFX source sheets")
    if [name for declaration in declarations for name in declaration.names] != list(VFX):
        raise ValueError("VFX sheets must preserve the exact semantic VFX order")
    if hud_declaration.names != HUD:
        raise ValueError("HUD sheet must preserve the exact HUD overlay order")

    vfx_images: list[tuple[str, Image.Image]] = []
    for index, (sheet, declaration) in enumerate(
        zip(vfx_sheets, declarations, strict=True), start=1
    ):
        try:
            vfx_images.extend(normalize_declared_sheet(sheet, declaration, OUTPUT_SIZE))
        except (OSError, ValueError) as error:
            raise ValueError(f"VFX sheet {index} ({sheet.name}): {error}") from error
    try:
        hud_images = normalize_declared_sheet(hud_sheet, hud_declaration, 64)
    except (OSError, ValueError) as error:
        raise ValueError(f"HUD sheet ({hud_sheet.name}): {error}") from error
    require_unique([*vfx_images, *hud_images])
    return save_images(vfx_images, vfx_output), save_images(hud_images, ui_output)


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


def validate_image_set(
    output: Path,
    names: Sequence[str],
    size: int,
    chromas: dict[str, RGB],
    *,
    exact: bool,
) -> tuple[list[str], list[tuple[str, Image.Image]]]:
    errors: list[str] = []
    expected_names = [f"{name}.png" for name in names]
    if exact:
        actual_names = sorted(
            path.name
            for path in output.iterdir()
            if path.is_file() and path.suffix.lower() == ".png"
        ) if output.is_dir() else []
        if actual_names != sorted(expected_names):
            missing = sorted(set(expected_names) - set(actual_names))
            unexpected = sorted(set(actual_names) - set(expected_names))
            errors.append(
                f"production output must contain exact filenames; missing={missing}, unexpected={unexpected}"
            )

    images: list[tuple[str, Image.Image]] = []
    for name in names:
        path = output / f"{name}.png"
        if not path.is_file():
            if not exact:
                errors.append(f"missing production output: {path}")
            continue
        try:
            with Image.open(path) as source:
                source.load()
                mode, dimensions = source.mode, source.size
                image = source.convert("RGBA")
        except OSError as error:
            errors.append(f"cannot decode production PNG {path}: {error}")
            continue
        if mode != "RGBA" or dimensions != (size, size):
            errors.append(f"production sprite must be {size} x {size} RGBA: {path}")
            continue
        if not has_transparent_padding(image):
            errors.append(f"production sprite must keep transparent padding: {path}")
        if any(is_declared_chroma(pixel, chromas[name]) for pixel in image.get_flattened_data()):
            errors.append(f"declared chroma survived normalization: {path}")
        images.append((name, image))
    return errors, images


def normalized_signature(image: Image.Image) -> bytes:
    return fit_square(image.convert("RGBA"), OUTPUT_SIZE).tobytes()


def validate_production_effect_pack(
    vfx_output: Path = PRODUCTION_VFX_OUTPUT,
    ui_output: Path = PRODUCTION_UI_OUTPUT,
    artifact_output: Path = PRODUCTION_OUTPUT,
) -> list[str]:
    errors = validate_production_pack(artifact_output)
    expected_hud_names = sorted(f"{name}.png" for name in HUD)
    actual_hud_names = sorted(
        path.name
        for path in ui_output.iterdir()
        if path.is_file()
        and path.suffix.lower() == ".png"
        and (path.name == "ammo-echo.png" or path.name.startswith("dealer-cut-"))
    ) if ui_output.is_dir() else []
    if actual_hud_names != expected_hud_names:
        missing = sorted(set(expected_hud_names) - set(actual_hud_names))
        unexpected = sorted(set(actual_hud_names) - set(expected_hud_names))
        errors.append(
            f"production output must contain exact HUD filenames; missing={missing}, unexpected={unexpected}"
        )
    vfx_chromas = {
        name: declaration.chroma
        for declaration in VFX_SHEETS
        for name in declaration.names
    }
    effect_errors, effect_images = validate_image_set(
        vfx_output, VFX, OUTPUT_SIZE, vfx_chromas, exact=True
    )
    hud_errors, hud_images = validate_image_set(
        ui_output, HUD, 64, {name: HUD_SHEET.chroma for name in HUD}, exact=False
    )
    errors.extend(effect_errors)
    errors.extend(hud_errors)

    all_images: list[tuple[str, Image.Image]] = []
    for name in EXPECTED:
        path = artifact_output / f"{name}.png"
        if not path.is_file():
            continue
        try:
            with Image.open(path) as source:
                source.load()
                all_images.append((name, source.convert("RGBA")))
        except OSError:
            pass
    all_images.extend(effect_images)
    all_images.extend(hud_images)
    seen: dict[bytes, str] = {}
    for name, image in all_images:
        try:
            signature = normalized_signature(image)
        except ValueError:
            continue
        if signature in seen:
            errors.append(f"duplicate normalized pixels: {seen[signature]} and {name}")
        else:
            seen[signature] = name
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
    build_labeled_contact_sheet(paths, EXPECTED, output, 6, OUTPUT_SIZE)


def build_labeled_contact_sheet(
    paths: Sequence[Path],
    names: Sequence[str],
    output: Path,
    columns: int,
    sprite_size: int,
) -> None:
    if [path.stem for path in paths] != list(names):
        raise ValueError("contact sheet paths must preserve declared sprite order")
    rows = (len(paths) + columns - 1) // columns
    card_width, card_height = sprite_size + 20, sprite_size + 36
    contact = checkerboard((columns * card_width + 20, rows * card_height + 20))
    draw = ImageDraw.Draw(contact)
    font = ImageFont.load_default()
    for index, path in enumerate(paths):
        column, row = index % columns, index // columns
        x, y = 10 + column * card_width, 10 + row * card_height
        with Image.open(path) as source:
            source.load()
            contact.alpha_composite(source.convert("RGBA"), (x + 10, y))
        draw.text((x + 4, y + sprite_size + 6), path.stem, fill=(245, 229, 192, 255), font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    contact.save(output)


def build_effect_contact_sheets(
    vfx_paths: Sequence[Path],
    hud_paths: Sequence[Path],
    vfx_output: Path,
    hud_output: Path,
) -> None:
    build_labeled_contact_sheet(vfx_paths, VFX, vfx_output, 6, OUTPUT_SIZE)
    build_labeled_contact_sheet(hud_paths, HUD, hud_output, 2, 64)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--effects", action="store_true", help="build the VFX and Deadeye HUD pack")
    for index, default in enumerate(PRODUCTION_SOURCES, start=1):
        parser.add_argument(f"--row-{index}", type=Path, default=default)
    parser.add_argument("--output", type=Path, default=PRODUCTION_OUTPUT)
    parser.add_argument("--contact-sheet", type=Path, default=PRODUCTION_CONTACT_SHEET)
    args = parser.parse_args()
    sources = [getattr(args, f"row_{index}") for index in range(1, 7)]

    if args.effects:
        vfx_outputs, hud_outputs = build_effect_pack(
            PRODUCTION_VFX_SOURCES,
            PRODUCTION_HUD_SOURCE,
            PRODUCTION_VFX_OUTPUT,
            PRODUCTION_UI_OUTPUT,
        )
        errors = validate_production_effect_pack()
        if errors:
            for error in errors:
                print(f"error: {error}")
            raise SystemExit(1)
        build_effect_contact_sheets(
            vfx_outputs,
            hud_outputs,
            PRODUCTION_VFX_CONTACT_SHEET,
            PRODUCTION_HUD_CONTACT_SHEET,
        )
        print("artifact effects pack validation passed")
        return

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
