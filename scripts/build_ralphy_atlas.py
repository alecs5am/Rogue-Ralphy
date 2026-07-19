#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["Pillow==12.2.0"]
# ///
"""Build and validate the ImageGen Ralphy combat runtime pack."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path

from PIL import Image

from split_atlas import fit_square, remove_chroma


CELL = 128
ATLAS_COLS = 12
ATLAS_ROWS = 6
VIEW_BASES = (0, 4, 8)

MOTION_IDLE = tuple(
    (view, source_col, 0, base + source_col)
    for view, base in enumerate(VIEW_BASES)
    for source_col in range(2)
)
MOTION_MOVE = tuple(
    (view, source_col + 2, 1, base + source_col)
    for view, base in enumerate(VIEW_BASES)
    for source_col in range(4)
)
ACTIONS_FIRE = tuple(
    (view, source_col, 2, base + source_col)
    for view, base in enumerate(VIEW_BASES)
    for source_col in range(2)
)
ACTIONS_RELOAD = tuple(
    (view, source_col + 2, 3, base + source_col)
    for view, base in enumerate(VIEW_BASES)
    for source_col in range(3)
)
ACTIONS_HURT = tuple((view, 5, 4, base) for view, base in enumerate(VIEW_BASES))

BODY_MAPPING = (
    ("motion", MOTION_IDLE),
    ("motion", MOTION_MOVE),
    ("actions", ACTIONS_FIRE),
    ("actions", ACTIONS_RELOAD),
    ("actions", ACTIONS_HURT),
)
REQUIRED_CELLS = {
    (target_col, target_row)
    for _, mapping in BODY_MAPPING
    for _, _, target_row, target_col in mapping
} | {(source_col, 5) for source_col in range(4)}


def load_sheet(path: Path) -> Image.Image:
    image = Image.open(path)
    image.load()
    return image if image.mode == "RGBA" else remove_chroma(image)


def grid_cell(image: Image.Image, col: int, row: int, cols: int, rows: int) -> Image.Image:
    return image.crop(
        (
            round(col * image.width / cols),
            round(row * image.height / rows),
            round((col + 1) * image.width / cols),
            round((row + 1) * image.height / rows),
        )
    )


def normalize_body_cell(cell: Image.Image, scale: float) -> Image.Image:
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("cell contains no opaque pixels after chroma removal")
    cropped = cell.crop(bounds)
    width = max(1, round(cropped.width * scale))
    height = max(1, round(cropped.height * scale))
    resized = cropped.resize((width, height), Image.Resampling.NEAREST)
    left = round(64 - width / 2)
    top = 108 - height
    if left < 0 or top < 0 or left + width > CELL or top + height > CELL:
        raise ValueError("normalized frame exceeds 128 x 128 cell")
    output = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    output.alpha_composite(resized, (left, top))
    return output


def require_frame(cell: Image.Image, family: str, col: int, row: int) -> None:
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"required frame is empty: {family} column {col}, row {row}")
    if bounds[0] == 0 or bounds[1] == 0 or bounds[2] == cell.width or bounds[3] == cell.height:
        raise ValueError(f"source alpha touches cell edge: {family} column {col}, row {row}")


def build_ralphy_atlas(motion: Path, actions: Path, death: Path, output: Path) -> None:
    sheets = {"motion": load_sheet(motion), "actions": load_sheet(actions)}
    motion_scale = min(CELL / (sheets["motion"].width / 6), CELL / (sheets["motion"].height / 3))
    atlas = Image.new("RGBA", (ATLAS_COLS * CELL, ATLAS_ROWS * CELL), (0, 0, 0, 0))

    for family, mapping in BODY_MAPPING:
        sheet = sheets[family]
        for source_row, source_col, target_row, target_col in mapping:
            cell = grid_cell(sheet, source_col, source_row, 6, 3)
            require_frame(cell, family, source_col, source_row)
            atlas.alpha_composite(
                normalize_body_cell(cell, motion_scale), (target_col * CELL, target_row * CELL)
            )

    death_sheet = load_sheet(death)
    first_death = grid_cell(death_sheet, 0, 0, 4, 1)
    require_frame(first_death, "death", 0, 0)
    normal_height = grid_cell(atlas, 0, 0, ATLAS_COLS, ATLAS_ROWS).getchannel("A").getbbox()
    if normal_height is None:
        raise ValueError("normalized down-idle frame is empty")
    death_bounds = first_death.getchannel("A").getbbox()
    assert death_bounds is not None
    death_scale = (normal_height[3] - normal_height[1]) / (death_bounds[3] - death_bounds[1])
    for source_col in range(4):
        cell = grid_cell(death_sheet, source_col, 0, 4, 1)
        require_frame(cell, "death", source_col, 0)
        atlas.alpha_composite(
            normalize_body_cell(cell, death_scale), (source_col * CELL, 5 * CELL)
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output)


def build_effect_sprites(
    source: Path,
    revolver_out: Path,
    projectile_out: Path,
    muzzle_out: Path,
) -> None:
    sheet = load_sheet(source)
    for col, destination in enumerate((revolver_out, projectile_out, muzzle_out)):
        cell = grid_cell(sheet, col, 0, 3, 1)
        require_frame(cell, "weapon-effects", col, 0)
        destination.parent.mkdir(parents=True, exist_ok=True)
        fit_square(cell, CELL).save(destination)


def has_green_spill(image: Image.Image) -> bool:
    return any(
        alpha and green > 110 and green - max(red, blue) > 18
        for red, green, blue, alpha in image.convert("RGBA").get_flattened_data()
    )


def validate_runtime_pack(atlas_path: Path, effect_paths: Sequence[Path]) -> list[str]:
    errors: list[str] = []
    atlas = Image.open(atlas_path)
    atlas.load()

    if atlas.mode != "RGBA":
        errors.append("atlas must be RGBA")
    if atlas.size != (ATLAS_COLS * CELL, ATLAS_ROWS * CELL):
        errors.append(f"atlas must be {ATLAS_COLS * CELL} x {ATLAS_ROWS * CELL}")

    rgba = atlas.convert("RGBA")
    if any(
        rgba.getpixel(point)[3] != 0
        for point in ((0, 0), (rgba.width - 1, 0), (0, rgba.height - 1), (rgba.width - 1, rgba.height - 1))
    ):
        errors.append("outer corners must be transparent")
    if has_green_spill(rgba):
        errors.append("chroma green survived")

    if rgba.size == (ATLAS_COLS * CELL, ATLAS_ROWS * CELL):
        for row in range(ATLAS_ROWS):
            for col in range(ATLAS_COLS):
                occupied = grid_cell(rgba, col, row, ATLAS_COLS, ATLAS_ROWS).getchannel("A").getbbox() is not None
                if (col, row) in REQUIRED_CELLS and not occupied:
                    errors.append(f"required atlas cell is empty: column {col}, row {row}")
                elif (col, row) not in REQUIRED_CELLS and occupied:
                    errors.append(f"unused atlas cell is not empty: column {col}, row {row}")

    for path in effect_paths:
        effect = Image.open(path)
        effect.load()
        if effect.mode != "RGBA" or effect.size != (CELL, CELL):
            errors.append(f"effect sprite must be 128 x 128 RGBA: {path}")
        if has_green_spill(effect):
            errors.append("chroma green survived")
    return errors


def checkerboard(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGBA", size, "#15171c")
    pixels = image.load()
    for y in range(size[1]):
        for x in range(size[0]):
            if (x // 16 + y // 16) % 2:
                pixels[x, y] = (40, 44, 52, 255)
    return image


def build_contact_sheet(atlas_path: Path, effect_paths: Sequence[Path], output: Path) -> None:
    atlas = Image.open(atlas_path).convert("RGBA")
    contact = checkerboard((atlas.width, atlas.height + CELL + 32))
    contact.alpha_composite(atlas)
    for index, path in enumerate(effect_paths):
        contact.alpha_composite(Image.open(path).convert("RGBA"), (16 + index * (CELL + 16), atlas.height + 16))
    output.parent.mkdir(parents=True, exist_ok=True)
    contact.save(output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--motion", type=Path, required=True)
    parser.add_argument("--actions", type=Path, required=True)
    parser.add_argument("--death", type=Path, required=True)
    parser.add_argument("--weapon-effects", type=Path, required=True)
    parser.add_argument("--atlas-out", type=Path, required=True)
    parser.add_argument("--revolver-out", type=Path, required=True)
    parser.add_argument("--projectile-out", type=Path, required=True)
    parser.add_argument("--muzzle-out", type=Path, required=True)
    parser.add_argument("--contact-sheet-out", type=Path, required=True)
    args = parser.parse_args()

    effect_paths = (args.revolver_out, args.projectile_out, args.muzzle_out)
    build_ralphy_atlas(args.motion, args.actions, args.death, args.atlas_out)
    build_effect_sprites(args.weapon_effects, *effect_paths)
    errors = validate_runtime_pack(args.atlas_out, effect_paths)
    if errors:
        for error in errors:
            print(f"error: {error}")
        raise SystemExit(1)
    build_contact_sheet(args.atlas_out, effect_paths, args.contact_sheet_out)
    print("runtime pack validation passed")


if __name__ == "__main__":
    main()
