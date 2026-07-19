import { expect, test } from "bun:test";
import { ASSET_PATHS } from "./assets";
import { heartStateAt, formatResource, ammoStateAt, setAttributeIfChanged, setPropertyIfChanged } from "./hud";

const hearts = (health: number) => Array.from({ length: 5 }, (_, index) => heartStateAt(health, index));

test("projects full half and empty hearts at HUD health boundaries", () => {
	expect(hearts(100)).toEqual(["full", "full", "full", "full", "full"]);
	expect(hearts(90)).toEqual(["full", "full", "full", "full", "half"]);
	expect(hearts(10)).toEqual(["half", "empty", "empty", "empty", "empty"]);
	expect(hearts(0)).toEqual(["empty", "empty", "empty", "empty", "empty"]);
});

test("formats bounded HUD resources with two digits", () => {
	expect([-1, 0, 7.9, 99, 100].map(formatResource)).toEqual(["00", "00", "07", "99", "99"]);
});

test("projects ordered cylinder slots instead of a numeric ammo prefix", () => {
	const slots = [
		{ loaded: false, echo: false },
		{ loaded: true, echo: false },
		{ loaded: false, echo: false },
		{ loaded: true, echo: true },
	] as const;
	expect(slots.map(ammoStateAt)).toEqual([
		{ src: ASSET_PATHS.ammoEmpty, alt: "Empty cartridge slot" },
		{ src: ASSET_PATHS.ammoLoaded, alt: "Loaded cartridge" },
		{ src: ASSET_PATHS.ammoEmpty, alt: "Empty cartridge slot" },
		{ src: ASSET_PATHS.ammoLoaded, alt: "Loaded echo cartridge" },
	]);
});

test("registers the final generated echo-ammo PNG path", () => {
	expect(ASSET_PATHS.ammoEcho).toBe("/assets/generated/ui/ammo-echo.png");
});

test("HUD projection skips unchanged DOM property writes", () => {
	let writes = 0;
	let value = "same";
	const probe = {
		get value() { return value; },
		set value(next: string) { writes += 1; value = next; },
	};

	setPropertyIfChanged(probe, "value", "same");
	expect(writes).toBe(0);
	setPropertyIfChanged(probe, "value", "changed");
	expect(writes).toBe(1);
});

test("HUD image projection compares relative source attributes without URL normalization", () => {
	let writes = 0;
	let source = "/assets/heart.png";
	const image = {
		getAttribute: () => source,
		setAttribute: (_: string, value: string) => { writes += 1; source = value; },
	};

	setAttributeIfChanged(image, "src", "/assets/heart.png");
	expect(writes).toBe(0);
	setAttributeIfChanged(image, "src", "/assets/heart-half.png");
	expect(writes).toBe(1);
});
