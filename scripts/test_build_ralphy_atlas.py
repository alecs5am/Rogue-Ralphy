from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main

from PIL import Image, ImageDraw

from build_ralphy_atlas import (
    build_effect_sprites,
    build_ralphy_atlas,
    validate_runtime_pack,
)


SOURCE_CELL = 64


def make_sheet(
    path: Path,
    cols: int,
    rows: int,
    filled: set[int],
    x_offsets: dict[int, int] | None = None,
) -> Path:
    image = Image.new("RGB", (cols * SOURCE_CELL, rows * SOURCE_CELL), "#00ff00")
    draw = ImageDraw.Draw(image)
    for index in filled:
        col, row = index % cols, index // cols
        left = col * SOURCE_CELL + (x_offsets or {}).get(index, 16)
        top = row * SOURCE_CELL + 12
        draw.rectangle((left, top, left + 15, top + 39), fill="#f5f5f4")
    image.save(path)
    return path


def atlas_cell(atlas: Image.Image, col: int, row: int) -> Image.Image:
    return atlas.crop((col * 128, row * 128, (col + 1) * 128, (row + 1) * 128))


def occupied_cell_count(atlas: Image.Image) -> int:
    return sum(
        atlas_cell(atlas, col, row).getchannel("A").getbbox() is not None
        for row in range(6)
        for col in range(12)
    )


def alpha_center_x(cell: Image.Image) -> float:
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        raise AssertionError("expected occupied atlas cell")
    return (bounds[0] + bounds[2]) / 2


def image_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.size


class RalphyAtlasTests(TestCase):
    def test_builds_exact_fixed_cell_runtime_atlas(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion = make_sheet(root / "motion.png", 6, 3, set(range(18)))
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)))
            death = make_sheet(root / "death.png", 4, 1, set(range(4)))
            output = root / "atlas.png"
            build_ralphy_atlas(motion, actions, death, output)
            atlas = Image.open(output)
            self.assertEqual(atlas.mode, "RGBA")
            self.assertEqual(atlas.size, (1536, 768))
            self.assertEqual(occupied_cell_count(atlas), 40)

    def test_preserves_one_transform_instead_of_recentering_frames(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion = make_sheet(root / "motion.png", 6, 3, set(range(18)), {0: 4, 1: 36})
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)))
            death = make_sheet(root / "death.png", 4, 1, set(range(4)))
            output = root / "atlas.png"
            build_ralphy_atlas(motion, actions, death, output)
            atlas = Image.open(output)
            self.assertNotEqual(alpha_center_x(atlas_cell(atlas, 0, 0)), alpha_center_x(atlas_cell(atlas, 1, 0)))

    def test_extracts_three_square_effect_sprites(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = make_sheet(root / "effects.png", 3, 1, {0, 1, 2})
            outputs = [root / "gun.png", root / "soul.png", root / "flash.png"]
            build_effect_sprites(source, *outputs)
            self.assertTrue(all(image_size(path) == (128, 128) for path in outputs))

    def test_rejects_empty_required_frame(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion = make_sheet(root / "motion.png", 6, 3, set(range(1, 18)))
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)))
            death = make_sheet(root / "death.png", 4, 1, set(range(4)))
            with self.assertRaisesRegex(ValueError, "required frame is empty"):
                build_ralphy_atlas(motion, actions, death, root / "atlas.png")

    def test_validation_rejects_corners_and_green_spill(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = Image.new("RGBA", (1536, 768), (0, 0, 0, 0))
            atlas.putpixel((0, 0), (245, 245, 244, 255))
            corner = root / "corner.png"
            atlas.save(corner)
            self.assertIn("outer corners must be transparent", validate_runtime_pack(corner, ()))

            atlas.putpixel((0, 0), (0, 0, 0, 0))
            atlas.putpixel((64, 64), (0, 255, 0, 255))
            green = root / "green.png"
            atlas.save(green)
            self.assertIn("chroma green survived", validate_runtime_pack(green, ()))

            atlas.putpixel((64, 64), (0, 0, 0, 0))
            clean = root / "clean.png"
            atlas.save(clean)
            effect = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
            effect.putpixel((64, 64), (0, 255, 0, 255))
            effect_path = root / "effect.png"
            effect.save(effect_path)
            self.assertIn("chroma green survived", validate_runtime_pack(clean, (effect_path,)))


if __name__ == "__main__":
    main()
