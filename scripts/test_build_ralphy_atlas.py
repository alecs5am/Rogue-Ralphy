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
    y_offsets: dict[int, int] | None = None,
    sizes: dict[int, tuple[int, int]] | None = None,
    colors: dict[int, tuple[int, int, int]] | None = None,
    cell_size: tuple[int, int] = (SOURCE_CELL, SOURCE_CELL),
) -> Path:
    cell_width, cell_height = cell_size
    image = Image.new("RGB", (cols * cell_width, rows * cell_height), "#00ff00")
    draw = ImageDraw.Draw(image)
    for index in filled:
        col, row = index % cols, index // cols
        left = col * cell_width + (x_offsets or {}).get(index, 16)
        top = row * cell_height + (y_offsets or {}).get(index, 12)
        width, height = (sizes or {}).get(index, (16, 40))
        draw.rectangle(
            (left, top, left + width - 1, top + height - 1),
            fill=(colors or {}).get(index, (245, 245, 244)),
        )
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


def alpha_geometry(cell: Image.Image) -> tuple[float, int, int, int]:
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        raise AssertionError("expected occupied atlas cell")
    return ((bounds[0] + bounds[2]) / 2, bounds[3], bounds[2] - bounds[0], bounds[3] - bounds[1])


def opaque_colors(cell: Image.Image) -> set[tuple[int, int, int]]:
    return {pixel[:3] for pixel in cell.convert("RGBA").get_flattened_data() if pixel[3]}


def valid_runtime_atlas() -> Image.Image:
    atlas = Image.new("RGBA", (1536, 768), (0, 0, 0, 0))
    required = {
        *((col, 0) for col in (0, 1, 4, 5, 8, 9)),
        *((col, 1) for col in range(12)),
        *((col, 2) for col in (0, 1, 4, 5, 8, 9)),
        *((col, 3) for col in (0, 1, 2, 4, 5, 6, 8, 9, 10)),
        *((col, 4) for col in (0, 4, 8)),
        *((col, 5) for col in range(4)),
    }
    for col, row in required:
        atlas.putpixel((col * 128 + 64, row * 128 + 64), (245, 245, 244, 255))
    return atlas


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

    def test_anchors_offset_frames_to_equal_centers_bottoms_and_sizes(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion = make_sheet(
                root / "motion.png",
                6,
                3,
                set(range(18)),
                x_offsets={0: 4, 1: 36},
                y_offsets={0: 4, 1: 20},
            )
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)))
            death = make_sheet(root / "death.png", 4, 1, set(range(4)))
            output = root / "atlas.png"
            build_ralphy_atlas(motion, actions, death, output)
            atlas = Image.open(output)
            self.assertEqual(alpha_geometry(atlas_cell(atlas, 0, 0)), (64, 108, 32, 80))
            self.assertEqual(alpha_geometry(atlas_cell(atlas, 1, 0)), (64, 108, 32, 80))

    def test_preserves_height_ratio_with_one_motion_action_scale(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion = make_sheet(
                root / "motion.png", 6, 3, set(range(18)), sizes={0: (16, 40), 1: (16, 20)}
            )
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)), sizes={0: (16, 30)})
            death = make_sheet(root / "death.png", 4, 1, set(range(4)))
            output = root / "atlas.png"
            build_ralphy_atlas(motion, actions, death, output)
            atlas = Image.open(output)
            heights = [
                alpha_geometry(atlas_cell(atlas, 0, 0))[3],
                alpha_geometry(atlas_cell(atlas, 1, 0))[3],
                alpha_geometry(atlas_cell(atlas, 0, 2))[3],
            ]
            self.assertEqual(heights, [80, 40, 60])

    def test_uses_first_death_frame_scale_for_the_whole_family(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion = make_sheet(root / "motion.png", 6, 3, set(range(18)))
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)))
            death = make_sheet(
                root / "death.png",
                4,
                1,
                set(range(4)),
                sizes={0: (30, 50), 1: (30, 25), 2: (30, 15), 3: (30, 15)},
                cell_size=(96, 80),
            )
            output = root / "atlas.png"
            build_ralphy_atlas(motion, actions, death, output)
            atlas = Image.open(output)
            self.assertEqual(
                [alpha_geometry(atlas_cell(atlas, col, 5))[3] for col in range(4)],
                [80, 40, 24, 24],
            )

    def test_maps_every_source_frame_to_the_exact_target_cell(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion_colors = {index: (200, 10, 20 + index * 10) for index in range(18)}
            action_colors = {index: (20 + index * 10, 10, 220) for index in range(18)}
            death_colors = {index: (220, 20 + index * 30, 180) for index in range(4)}
            motion = make_sheet(root / "motion.png", 6, 3, set(range(18)), colors=motion_colors)
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)), colors=action_colors)
            death = make_sheet(root / "death.png", 4, 1, set(range(4)), colors=death_colors)
            output = root / "atlas.png"
            build_ralphy_atlas(motion, actions, death, output)
            atlas = Image.open(output)
            expected = {
                **{(base + col, 0): motion_colors[row * 6 + col] for row, base in enumerate((0, 4, 8)) for col in range(2)},
                **{(base + col - 2, 1): motion_colors[row * 6 + col] for row, base in enumerate((0, 4, 8)) for col in range(2, 6)},
                **{(base + col, 2): action_colors[row * 6 + col] for row, base in enumerate((0, 4, 8)) for col in range(2)},
                **{(base + col - 2, 3): action_colors[row * 6 + col] for row, base in enumerate((0, 4, 8)) for col in range(2, 5)},
                **{(base, 4): action_colors[row * 6 + 5] for row, base in enumerate((0, 4, 8))},
                **{(col, 5): death_colors[col] for col in range(4)},
            }
            for target, color in expected.items():
                with self.subTest(target=target):
                    self.assertEqual(opaque_colors(atlas_cell(atlas, *target)), {color})

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

    def test_rejects_source_alpha_touching_a_cell_boundary(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion = make_sheet(root / "motion.png", 6, 3, set(range(18)))
            image = Image.open(motion)
            image.putpixel((0, 32), (245, 245, 244))
            image.save(motion)
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)))
            death = make_sheet(root / "death.png", 4, 1, set(range(4)))
            with self.assertRaisesRegex(ValueError, "touches cell edge"):
                build_ralphy_atlas(motion, actions, death, root / "atlas.png")

    def test_rejects_a_normalized_frame_that_would_be_clipped(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion = make_sheet(
                root / "motion.png",
                6,
                3,
                set(range(18)),
                y_offsets={0: 4},
                sizes={0: (16, 56)},
            )
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)))
            death = make_sheet(root / "death.png", 4, 1, set(range(4)))
            with self.assertRaisesRegex(ValueError, "normalized frame exceeds"):
                build_ralphy_atlas(motion, actions, death, root / "atlas.png")

    def test_validation_rejects_wrong_modes_sizes_and_unused_occupancy(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)

            wrong_mode = root / "wrong-mode.png"
            valid_runtime_atlas().convert("RGB").save(wrong_mode)
            self.assertIn("atlas must be RGBA", validate_runtime_pack(wrong_mode, ()))

            wrong_size = root / "wrong-size.png"
            Image.new("RGBA", (128, 128), (0, 0, 0, 0)).save(wrong_size)
            self.assertIn("atlas must be 1536 x 768", validate_runtime_pack(wrong_size, ()))

            occupied_unused = valid_runtime_atlas()
            occupied_unused.putpixel((11 * 128 + 64, 64), (245, 245, 244, 255))
            occupied_unused_path = root / "occupied-unused.png"
            occupied_unused.save(occupied_unused_path)
            self.assertIn(
                "unused atlas cell is not empty: column 11, row 0",
                validate_runtime_pack(occupied_unused_path, ()),
            )

            valid_atlas_path = root / "valid.png"
            valid_runtime_atlas().save(valid_atlas_path)
            bad_effects = (
                (root / "wrong-effect-mode.png", Image.new("RGB", (128, 128), (0, 0, 0))),
                (root / "wrong-effect-size.png", Image.new("RGBA", (64, 128), (0, 0, 0, 0))),
            )
            for bad_effect, image in bad_effects:
                with self.subTest(bad_effect=bad_effect):
                    image.save(bad_effect)
                    self.assertIn(
                        f"effect sprite must be 128 x 128 RGBA: {bad_effect}",
                        validate_runtime_pack(valid_atlas_path, (bad_effect,)),
                    )

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
