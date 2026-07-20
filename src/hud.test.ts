import { expect, test } from "bun:test";
import { ASSET_PATHS } from "./assets";
import type { VfxCommand } from "./game/combat-effects";
import { createGame } from "./game/simulation";
import {
	ammoStateAt,
	dealerStateAt,
	formatResource,
	heartStateAt,
	mountHud,
	projectHudDelivery,
	setAttributeIfChanged,
	setPropertyIfChanged,
	updateHud,
} from "./hud";

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
		{ loaded: false, echo: null },
		{ loaded: true, echo: null },
		{ loaded: false, echo: null },
		{ loaded: true, echo: { delay: 0.12, damageScale: 0.35 } },
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

class FakeElement {
	children: FakeElement[] = [];
	parentElement: FakeElement | null = null;
	className = "";
	alt = "";
	hidden = false;
	textContent: string | null = "";
	dataset: Record<string, string> = {};
	style: Record<string, string> = {};
	private attributes = new Map<string, string>();
	bounds: DOMRect = {
		left: 20, top: 20, width: 28, height: 28, right: 48, bottom: 48, x: 20, y: 20,
		toJSON: () => ({}),
	};

	get src(): string { return this.attributes.get("src") ?? ""; }
	set src(value: string) { this.attributes.set("src", value); }
	append(...nodes: FakeElement[]): void {
		for (const node of nodes) {
			node.remove();
			node.parentElement = this;
			this.children.push(node);
		}
	}
	replaceChildren(...nodes: FakeElement[]): void {
		for (const child of this.children) child.parentElement = null;
		this.children = [];
		this.append(...nodes);
	}
	remove(): void {
		if (!this.parentElement) return;
		const index = this.parentElement.children.indexOf(this);
		if (index >= 0) this.parentElement.children.splice(index, 1);
		this.parentElement = null;
	}
	getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
	setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
	getBoundingClientRect(): DOMRect { return this.bounds; }
}

const findClass = (root: FakeElement, className: string): FakeElement | undefined => {
	if (root.className === className) return root;
	for (const child of root.children) {
		const match = findClass(child, className);
		if (match) return match;
	}
};

test("renders echo ammo as a separate generated overlay on a loaded cartridge", () => {
	const previousDocument = globalThis.document;
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: { createElement: () => new FakeElement() },
	});
	try {
		const root = new FakeElement();
		mountHud(root as unknown as HTMLElement);
		const state = createGame(() => 0.9);
		const slots = state.cylinder.slots.map((_slot, index) => index === 0
			? { loaded: true, echo: { delay: 0.12, damageScale: 0.35 } }
			: index === 1 ? { loaded: true, echo: null } : { loaded: false, echo: null });
		state.cylinder = {
			...state.cylinder,
			slots: slots as unknown as typeof state.cylinder.slots,
		};
		state.artifacts = { dealersCut: true };
		state.dealerCounter = 2;
		updateHud(state);

		const ammo = findClass(root, "ammo")!;
		expect(ammo.children[0]?.children.map((node) => ({ src: node.src, className: node.className }))).toEqual([
			{ src: ASSET_PATHS.ammoLoaded, className: "ammo-base" },
			{ src: ASSET_PATHS.ammoEcho, className: "ammo-echo" },
		]);
		expect(ammo.children[1]?.children.map((node) => node.src)).toEqual([ASSET_PATHS.ammoLoaded]);
		expect(ammo.children.slice(2).map((tile) => tile.children.map((node) => node.src))).toEqual(
			Array.from({ length: 4 }, () => [ASSET_PATHS.ammoEmpty]),
		);
		const dealer = findClass(root, "dealer-cut")!;
		expect(dealer.hidden).toBe(false);
		expect(dealer.children.map((node) => node.src || node.textContent)).toEqual([
			ASSET_PATHS.dealerCut3,
			"3/3",
		]);
	} finally {
		Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
	}
});

test("adds a visible heart slot when a health pickup raises max health", () => {
	const previousDocument = globalThis.document;
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: { createElement: () => new FakeElement() },
	});
	try {
		const root = new FakeElement();
		mountHud(root as unknown as HTMLElement);
		const state = createGame(() => 0.9);
		state.player = { ...state.player, health: 120, maxHealth: 120 };
		updateHud(state);

		const health = findClass(root, "hearts")!;
		expect(health.children).toHaveLength(6);
		expect(health.children.map((slot) => slot.children[0]?.src)).toEqual(
			Array.from({ length: 6 }, () => ASSET_PATHS.heartFull),
		);
	} finally {
		Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
	}
});

test("maps the pre-reset Dealer's Cut counter to three generated states", () => {
	expect([0, 1, 2].map(dealerStateAt)).toEqual([
		{ asset: "dealerCut1", src: ASSET_PATHS.dealerCut1, text: "1/3" },
		{ asset: "dealerCut2", src: ASSET_PATHS.dealerCut2, text: "2/3" },
		{ asset: "dealerCut3", src: ASSET_PATHS.dealerCut3, text: "3/3" },
	]);
});

const hudDelivery = (): Extract<VfxCommand, { destination: "hud" }> => ({
	id: "bonanza-1",
	artifactId: "bonanzaClip",
	effectId: "bonanzaClip.refund",
	rootTriggerId: "root:refund",
	bornAt: 1,
	expiresAt: 2.2,
	destination: "hud",
	kind: "bonanza.delivery",
	geometry: {
		type: "hudDelivery",
		from: { x: 480, y: 288 },
		slot: 2,
		arrivesAt: 2,
	},
});

test("keeps the Bonanza gold-soul cue for a full-cylinder no-op arrival", () => {
	const previousDocument = globalThis.document;
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: { createElement: () => new FakeElement() },
	});
	try {
		const root = new FakeElement();
		const canvas = new FakeElement();
		canvas.bounds = {
			left: 120, top: 80, width: 960, height: 576, right: 1080, bottom: 656, x: 120, y: 80,
			toJSON: () => ({}),
		};
		mountHud(root as unknown as HTMLElement);
		const state = createGame(() => 0.9);
		state.time = 1.5;
		state.vfxCommands = [hudDelivery()];
		updateHud(state, canvas as unknown as HTMLCanvasElement);

		const layer = findClass(root, "hud-deliveries")!;
		expect(layer.children.map((node) => ({ src: node.src, ariaHidden: node.getAttribute("aria-hidden") }))).toEqual([
			{ src: ASSET_PATHS.goldSoul, ariaHidden: "true" },
		]);
	} finally {
		Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
	}
});

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
	left,
	top,
	width,
	height,
	right: left + width,
	bottom: top + height,
	x: left,
	y: top,
	toJSON: () => ({}),
});

test("projects Bonanza delivery from canvas world coordinates to either viewport ammo slot", () => {
	const command = hudDelivery();
	for (const [canvas, slot] of [
		[rect(120, 80, 960, 576), rect(148, 104, 28, 28)],
		[rect(10, 240, 768, 460.8), rect(26, 256, 22, 22)],
	] as const) {
		const viewport = { x: 0, y: 0, width: 960, height: 576 };
		const start = projectHudDelivery(command, canvas, slot, command.bornAt, viewport);
		const end = projectHudDelivery(command, canvas, slot, command.geometry.arrivesAt, viewport);
		const middle = projectHudDelivery(command, canvas, slot, 1.5, viewport);

		expect(start).toMatchObject({
			id: "bonanza-1",
			artifactId: "bonanzaClip",
			rootTriggerId: "root:refund",
			x: canvas.left + canvas.width / 2,
			y: canvas.top + canvas.height / 2,
		});
		expect(end).toMatchObject({ x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 });
		expect(middle.x).toBeCloseTo((start.x + end.x) / 2);
		expect(middle.y).toBeCloseTo((start.y + end.y) / 2);
	}
});

test("projects an arena Bonanza delivery through the active camera viewport", () => {
	const command = {
		...hudDelivery(),
		geometry: { ...hudDelivery().geometry, from: { x: 800, y: 480 } },
	};
	const canvas = rect(0, 0, 960, 576);
	const slot = rect(20, 20, 28, 28);
	const start = projectHudDelivery(command, canvas, slot, command.bornAt, {
		x: 320,
		y: 192,
		width: 960,
		height: 576,
	});

	expect(start).toMatchObject({ x: 480, y: 288 });
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
