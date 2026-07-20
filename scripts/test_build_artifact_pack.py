from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main

from PIL import Image, ImageDraw

from build_artifact_pack import (
    EXPECTED,
    ICON_FAMILIES,
    PADDING,
    build_contact_sheet,
    build_family,
    build_pack,
    remove_declared_chroma,
    validate_production_pack,
)


CELL = 64


def synthetic_color(index: int) -> tuple[int, int, int]:
    return (30 + index * 5 % 180, 40 + index * 7 % 150, 25 + index * 11 % 180)


def make_family_sheet(
    path: Path,
    family_index: int,
    *,
    empty: set[int] | None = None,
    duplicate: tuple[int, int] | None = None,
) -> Path:
    declaration = ICON_FAMILIES[family_index]
    image = Image.new(
        "RGB",
        (declaration.columns * CELL, declaration.rows * CELL),
        declaration.chroma,
    )
    draw = ImageDraw.Draw(image)
    for cell_index in range(declaration.columns * declaration.rows):
        if cell_index in (empty or set()):
            continue
        color_index = family_index * 6 + cell_index
        if duplicate is not None and cell_index == duplicate[1]:
            color_index = family_index * 6 + duplicate[0]
        col, row = cell_index % declaration.columns, cell_index // declaration.columns
        draw.rectangle(
            (col * CELL + 14, row * CELL + 12, col * CELL + 49, row * CELL + 51),
            fill=synthetic_color(color_index),
        )
    image.save(path)
    return path


def build_synthetic_fixture_sheets(root: Path) -> list[Path]:
    return [make_family_sheet(root / f"row-{index + 1}.png", index) for index in range(6)]


def alpha_has_padding(image: Image.Image, padding: int = PADDING) -> bool:
    bounds = image.getchannel("A").getbbox()
    return bounds is not None and (
        bounds[0] >= padding
        and bounds[1] >= padding
        and bounds[2] <= image.width - padding
        and bounds[3] <= image.height - padding
    )


class ArtifactPackTests(TestCase):
    def test_runtime_pack_is_complete_rgba_padded_and_unique(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            outputs = build_pack(build_synthetic_fixture_sheets(root), root / "out")
            self.assertEqual([path.stem for path in outputs], list(EXPECTED))

            pixels: set[bytes] = set()
            for path in outputs:
                with Image.open(path) as image:
                    image.load()
                    self.assertEqual(image.mode, "RGBA")
                    self.assertEqual(image.size, (128, 128))
                    self.assertTrue(alpha_has_padding(image))
                    pixels.add(image.tobytes())
            self.assertEqual(len(pixels), 36)
            self.assertEqual(validate_production_pack(root / "out"), [])

    def test_declares_six_exact_three_by_two_families_and_safe_chroma(self) -> None:
        self.assertEqual(len(ICON_FAMILIES), 6)
        self.assertTrue(all((family.columns, family.rows) == (3, 2) for family in ICON_FAMILIES))
        self.assertEqual(
            [family.chroma for family in ICON_FAMILIES],
            [
                (6, 248, 6),
                (249, 5, 248),
                (249, 4, 230),
                (245, 5, 243),
                (246, 4, 214),
                (248, 5, 233),
            ],
        )
        self.assertEqual([name for family in ICON_FAMILIES for name in family.names], list(EXPECTED))

    def test_rejects_non_divisible_source_dimensions(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            sheet = make_family_sheet(root / "row.png", 0)
            image = Image.open(sheet)
            image.crop((0, 0, image.width - 1, image.height)).save(sheet)
            with self.assertRaisesRegex(ValueError, "dimensions must divide exactly"):
                build_family(
                    sheet,
                    list(ICON_FAMILIES[0].names),
                    root / "out",
                    3,
                    2,
                    ICON_FAMILIES[0].chroma,
                )

    def test_rejects_wrong_family_size_and_non_kebab_names(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            sheet = make_family_sheet(root / "row.png", 0)
            with self.assertRaisesRegex(ValueError, "exactly six names"):
                build_family(sheet, ["one"], root / "out", 3, 2, (0, 255, 0))
            bad_names = list(ICON_FAMILIES[0].names)
            bad_names[0] = "Twin Chamber"
            with self.assertRaisesRegex(ValueError, "kebab-case"):
                build_family(sheet, bad_names, root / "out", 3, 2, (0, 255, 0))

    def test_rejects_empty_or_edge_touching_cells(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            empty = make_family_sheet(root / "empty.png", 0, empty={4})
            with self.assertRaisesRegex(ValueError, "cell is empty"):
                build_family(
                    empty,
                    list(ICON_FAMILIES[0].names),
                    root / "empty-out",
                    3,
                    2,
                    (0, 255, 0),
                )

            touching = make_family_sheet(root / "touching.png", 0)
            image = Image.open(touching)
            image.putpixel((CELL, 24), synthetic_color(0))
            image.save(touching)
            with self.assertRaisesRegex(ValueError, "touches cell edge"):
                build_family(
                    touching,
                    list(ICON_FAMILIES[0].names),
                    root / "touching-out",
                    3,
                    2,
                    (0, 255, 0),
                )

    def test_accepts_flat_border_variance_and_rejects_mismatched_border(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            varied = make_family_sheet(root / "varied.png", 0)
            image = Image.open(varied)
            red, green, blue = ICON_FAMILIES[0].chroma
            image.putpixel((0, 0), (red + 12, green - 12, blue + 12))
            image.save(varied)
            outputs = build_family(
                varied,
                list(ICON_FAMILIES[0].names),
                root / "varied-out",
                3,
                2,
                ICON_FAMILIES[0].chroma,
            )
            self.assertEqual(len(outputs), 6)

            mismatch = make_family_sheet(root / "mismatch.png", 0)
            with self.assertRaisesRegex(ValueError, "declared chroma does not match sheet border"):
                build_family(
                    mismatch,
                    list(ICON_FAMILIES[0].names),
                    root / "mismatch-out",
                    3,
                    2,
                    (255, 0, 255),
                )

    def test_removes_enclosed_chroma_holes_and_preserves_non_key_subject_color(self) -> None:
        chroma = ICON_FAMILIES[0].chroma
        subject = (110, 70, 130)
        image = Image.new("RGB", (CELL, CELL), chroma)
        draw = ImageDraw.Draw(image)
        draw.rectangle((12, 12, 51, 51), fill=subject)
        draw.rectangle((28, 28, 35, 35), fill=chroma)

        cleaned = remove_declared_chroma(image, chroma)
        self.assertEqual(cleaned.getpixel((31, 31))[3], 0)
        self.assertEqual(cleaned.getpixel((20, 20)), subject + (255,))

    def test_pack_errors_identify_family_and_artifact(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            sheets = build_synthetic_fixture_sheets(root)
            sheets[2] = make_family_sheet(root / "row-3.png", 2, empty={2})
            with self.assertRaisesRegex(ValueError, r"family 3 .*bone-orchard"):
                build_pack(sheets, root / "out")

    def test_rejects_duplicate_normalized_pixels_before_writing(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            sheets = build_synthetic_fixture_sheets(root)
            sheets[0] = make_family_sheet(root / "row-1.png", 0, duplicate=(0, 1))
            output = root / "out"
            with self.assertRaisesRegex(ValueError, "duplicate normalized pixels"):
                build_pack(sheets, output)
            self.assertFalse(output.exists())

    def test_rejects_catalog_order_other_than_the_exact_36_ids(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            sheets = build_synthetic_fixture_sheets(root)
            declarations = list(ICON_FAMILIES)
            declarations[0] = replace(
                declarations[0], names=tuple(reversed(declarations[0].names))
            )
            with self.assertRaisesRegex(ValueError, "exact artifact catalog order"):
                build_pack(sheets, root / "out", declarations)

    def test_production_validator_rejects_exact_set_decode_shape_padding_chroma_and_duplicates(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "out"
            build_pack(build_synthetic_fixture_sheets(root), output)

            (output / "twin-chamber.png").rename(output / "extra.png")
            self.assertTrue(
                any("exact filenames" in error for error in validate_production_pack(output))
            )
            (output / "extra.png").rename(output / "twin-chamber.png")

            (output / "deadeye.png").write_bytes(b"not a png")
            self.assertTrue(any("cannot decode" in error for error in validate_production_pack(output)))

            build_pack(build_synthetic_fixture_sheets(root), output)
            wrong = Image.open(output / "last-bell.png").convert("RGB")
            wrong.save(output / "last-bell.png")
            self.assertTrue(
                any("must be 128 x 128 RGBA" in error for error in validate_production_pack(output))
            )

            build_pack(build_synthetic_fixture_sheets(root), output)
            contaminated = Image.open(output / "grave-echo.png").convert("RGBA")
            contaminated.putpixel((0, 0), (20, 20, 20, 255))
            contaminated.putpixel((64, 64), ICON_FAMILIES[0].chroma + (255,))
            contaminated.save(output / "grave-echo.png")
            errors = validate_production_pack(output)
            self.assertTrue(any("transparent padding" in error for error in errors))
            self.assertTrue(any("declared chroma survived" in error for error in errors))

            build_pack(build_synthetic_fixture_sheets(root), output)
            (output / "deadeye.png").write_bytes((output / "twin-chamber.png").read_bytes())
            self.assertTrue(
                any("duplicate normalized pixels" in error for error in validate_production_pack(output))
            )

    def test_builds_labeled_contact_sheet_outside_runtime_art(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            outputs = build_pack(build_synthetic_fixture_sheets(root), root / "out")
            contact = root / "contact.png"
            build_contact_sheet(outputs, contact)
            with Image.open(contact) as image:
                image.load()
                self.assertEqual(image.mode, "RGBA")
                self.assertGreater(image.width, 6 * 128)
                self.assertGreater(image.height, 6 * 128)


if __name__ == "__main__":
    main()
