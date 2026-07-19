import { expect, test } from "bun:test";
import { heartStateAt, formatResource } from "./hud";

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
