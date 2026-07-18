#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["Pillow==12.2.0"]
# ///
"""Split an imagegen atlas into sprites; run with `uv run scripts/split_atlas.py`."""

from __future__ import annotations

import argparse
from pathlib import Path
from statistics import median

from PIL import Image


def border_key(image: Image.Image) -> tuple[int, int, int]:
    pixels = image.load()
    width, height = image.size
    border = (
        [pixels[x, 0][:3] for x in range(width)]
        + [pixels[x, height - 1][:3] for x in range(width)]
        + [pixels[0, y][:3] for y in range(height)]
        + [pixels[width - 1, y][:3] for y in range(height)]
    )
    return tuple(int(median(channel)) for channel in zip(*border))  # type: ignore[return-value]


def remove_chroma(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    key_r, key_g, key_b = border_key(rgba)
    cleaned: list[tuple[int, int, int, int]] = []

    for red, green, blue, _ in rgba.get_flattened_data():
        key_distance = (red - key_r) ** 2 + (green - key_g) ** 2 + (blue - key_b) ** 2
        green_dominant = (
            green > 110
            and green - max(red, blue) > 18
            and green > red * 1.18
            and green > blue * 1.12
        )
        if key_distance < 90**2 or green_dominant:
            cleaned.append((0, 0, 0, 0))
        else:
            cleaned.append((red, min(green, max(red, blue) + 10), blue, 255))

    rgba.putdata(cleaned)
    return rgba


def fit_square(sprite: Image.Image, size: int) -> Image.Image:
    bounds = sprite.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("cell contains no opaque pixels after chroma removal")

    cropped = sprite.crop(bounds)
    available = size - 8
    scale = min(available / cropped.width, available / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.NEAREST,
    )
    output = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    output.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return output


def split_atlas(source: Path, out_dir: Path, cols: int, rows: int, names: list[str], size: int) -> None:
    if cols < 1 or rows < 1 or size < 16:
        raise ValueError("cols and rows must be positive; size must be at least 16")
    if len(names) != cols * rows:
        raise ValueError(f"expected {cols * rows} names, received {len(names)}")

    image = remove_chroma(Image.open(source))
    out_dir.mkdir(parents=True, exist_ok=True)

    for index, name in enumerate(names):
        col, row = index % cols, index // cols
        bounds = (
            round(col * image.width / cols),
            round(row * image.height / rows),
            round((col + 1) * image.width / cols),
            round((row + 1) * image.height / rows),
        )
        output = fit_square(image.crop(bounds), size)
        destination = out_dir / f"{name}.png"
        output.save(destination)
        print(destination)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--cols", type=int, required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--names", required=True, help="comma-separated row-major output names")
    parser.add_argument("--size", type=int, default=128)
    args = parser.parse_args()
    names = [name.strip() for name in args.names.split(",") if name.strip()]
    split_atlas(args.input, args.out_dir, args.cols, args.rows, names, args.size)


if __name__ == "__main__":
    main()
