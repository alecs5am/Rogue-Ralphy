import { ASSET_PATHS } from "./assets";
import { clampResource, type GameState } from "./game/simulation";

let hearts: HTMLImageElement[] = [];
let ammo: HTMLImageElement[] = [];
let resources: Record<keyof GameState["resources"], HTMLElement> | undefined;

const image = (src: string, alt: string): HTMLImageElement => {
	const element = document.createElement("img");
	element.src = src;
	element.alt = alt;
	return element;
};

export function mountHud(root: HTMLElement): void {
	const health = document.createElement("div");
	health.className = "hearts";
	hearts = Array.from({ length: 5 }, () => image(ASSET_PATHS.heartEmpty, "Empty heart"));
	for (const icon of hearts) {
		const container = document.createElement("span");
		container.className = "heart";
		container.append(icon);
		health.append(container);
	}

	const cylinder = document.createElement("div");
	cylinder.className = "ammo";
	ammo = Array.from({ length: 6 }, () => image(ASSET_PATHS.ammoEmpty, "Empty cartridge slot"));
	for (const icon of ammo) {
		const tile = document.createElement("span");
		tile.className = "ammo-tile";
		tile.append(icon);
		cylinder.append(tile);
	}

	const resourceRow = document.createElement("div");
	resourceRow.className = "resources";
	resources = {} as Record<keyof GameState["resources"], HTMLElement>;
	for (const [key, iconKey, label] of [
		["coins", "coin", "Coins"],
		["bombs", "bomb", "Bombs"],
		["keys", "key", "Keys"],
	] as const) {
		const item = document.createElement("span");
		item.className = "resource";
		const value = document.createElement("strong");
		value.dataset.resource = key;
		value.textContent = "00";
		resources[key] = value;
		item.append(image(ASSET_PATHS[iconKey], label), value);
		resourceRow.append(item);
	}

	root.replaceChildren(health, cylinder, resourceRow);
}

export function updateHud(state: GameState): void {
	for (const [index, icon] of hearts.entries()) {
		const remaining = state.player.health - index * 20;
		const [src, alt] = remaining >= 20
			? [ASSET_PATHS.heartFull, "Full heart"]
			: remaining >= 10
				? [ASSET_PATHS.heartHalf, "Half heart"]
				: [ASSET_PATHS.heartEmpty, "Empty heart"];
		icon.src = src;
		icon.alt = alt;
	}
	for (const [index, icon] of ammo.entries()) {
		const loaded = index < state.reload.ammo;
		icon.src = loaded ? ASSET_PATHS.ammoLoaded : ASSET_PATHS.ammoEmpty;
		icon.alt = loaded ? "Loaded cartridge" : "Empty cartridge slot";
	}
	if (!resources) return;
	for (const key of ["coins", "bombs", "keys"] as const)
		resources[key].textContent = String(clampResource(state.resources[key])).padStart(2, "0");
}
