import { ASSET_PATHS } from "./assets";
import type { VfxCommand } from "./game/combat-effects";
import type { CylinderSlot } from "./game/cylinder";
import { clampResource, type GameState } from "./game/simulation";
import { projectViewport, type Viewport } from "./render";

let hearts: HTMLImageElement[] = [];
let heartContainer: HTMLElement | undefined;
let ammo: HTMLImageElement[] = [];
let ammoTiles: HTMLElement[] = [];
let ammoEchoes: Array<HTMLImageElement | undefined> = [];
let resources: Record<keyof GameState["resources"], HTMLElement> | undefined;
let dealer: HTMLElement | undefined;
let dealerIcon: HTMLImageElement | undefined;
let dealerText: HTMLElement | undefined;
let deliveryLayer: HTMLElement | undefined;
const deliveries = new Map<string, HTMLImageElement>();

export const heartStateAt = (health: number, index: number): "full" | "half" | "empty" => {
	const remaining = health - index * 20;
	return remaining >= 20 ? "full" : remaining >= 10 ? "half" : "empty";
};
export const formatResource = (value: number): string => String(clampResource(value)).padStart(2, "0");
export const ammoStateAt = (slot: CylinderSlot): { src: string; alt: string } => slot.loaded
	? { src: ASSET_PATHS.ammoLoaded, alt: slot.echo ? "Loaded echo cartridge" : "Loaded cartridge" }
	: { src: ASSET_PATHS.ammoEmpty, alt: "Empty cartridge slot" };
export const dealerStateAt = (counter: number): {
	asset: "dealerCut1" | "dealerCut2" | "dealerCut3";
	src: string;
	text: "1/3" | "2/3" | "3/3";
} => counter <= 0
	? { asset: "dealerCut1", src: ASSET_PATHS.dealerCut1, text: "1/3" }
	: counter === 1
		? { asset: "dealerCut2", src: ASSET_PATHS.dealerCut2, text: "2/3" }
		: { asset: "dealerCut3", src: ASSET_PATHS.dealerCut3, text: "3/3" };

type HudDeliveryCommand = Extract<VfxCommand, { destination: "hud" }>;
export type HudDeliveryProjection = Readonly<{
	id: string;
	artifactId: "bonanzaClip";
	effectId: string;
	rootTriggerId: string;
	slot: number;
	x: number;
	y: number;
	progress: number;
}>;

export function projectHudDelivery(
	command: HudDeliveryCommand,
	canvasRect: DOMRect,
	ammoSlotRect: DOMRect,
	now: number,
	viewport: Viewport,
): HudDeliveryProjection {
	const duration = command.geometry.arrivesAt - command.bornAt;
	const progress = duration <= 0 ? 1 : Math.max(0, Math.min(1, (now - command.bornAt) / duration));
	const from = {
		x: canvasRect.left + (command.geometry.from.x - viewport.x) / viewport.width * canvasRect.width,
		y: canvasRect.top + (command.geometry.from.y - viewport.y) / viewport.height * canvasRect.height,
	};
	const to = {
		x: ammoSlotRect.left + ammoSlotRect.width / 2,
		y: ammoSlotRect.top + ammoSlotRect.height / 2,
	};
	return {
		id: command.id,
		artifactId: "bonanzaClip",
		effectId: command.effectId,
		rootTriggerId: command.rootTriggerId,
		slot: command.geometry.slot,
		x: from.x + (to.x - from.x) * progress,
		y: from.y + (to.y - from.y) * progress,
		progress,
	};
}
export function setPropertyIfChanged<T, K extends keyof T>(target: T, key: K, value: T[K]): void {
	if (target[key] !== value) target[key] = value;
}
export function setAttributeIfChanged(
	target: Pick<Element, "getAttribute" | "setAttribute">,
	name: string,
	value: string,
): void {
	if (target.getAttribute(name) !== value) target.setAttribute(name, value);
}

const image = (src: string, alt: string): HTMLImageElement => {
    const element = document.createElement("img");
    element.src = src;
    element.alt = alt;
    return element;
};

function mountHeartSlots(container: HTMLElement, count: number): void {
	hearts = Array.from({ length: count }, () => image(ASSET_PATHS.heartEmpty, "Empty heart"));
	container.replaceChildren();
	for (const icon of hearts) {
		const slot = document.createElement("span");
		slot.className = "heart";
		slot.append(icon);
		container.append(slot);
	}
}

function ensureHeartSlots(count: number): void {
	if (hearts.length !== count && heartContainer) mountHeartSlots(heartContainer, count);
}

function mountAmmoSlots(cylinder: HTMLElement, count: number): void {
    ammo = Array.from({ length: count }, () => image(ASSET_PATHS.ammoEmpty, "Empty cartridge slot"));
    ammoTiles = [];
    ammoEchoes = Array.from({ length: count });
    cylinder.replaceChildren();
    for (const icon of ammo) {
        const tile = document.createElement("span");
        tile.className = "ammo-tile";
        icon.className = "ammo-base";
        tile.append(icon);
        cylinder.append(tile);
        ammoTiles.push(tile);
    }
}

function ensureAmmoSlots(count: number): void {
    if (ammo.length === count) return;
    const cylinder = document.querySelector<HTMLElement>("#hud .ammo");
    if (cylinder) mountAmmoSlots(cylinder, count);
}

export function mountHud(root: HTMLElement): void {
	const health = document.createElement("div");
	health.className = "hearts";
	heartContainer = health;
	mountHeartSlots(health, 5);

    const cylinder = document.createElement("div");
    cylinder.className = "ammo";
    mountAmmoSlots(cylinder, 6);

	dealer = document.createElement("div");
	dealer.className = "dealer-cut";
	dealerIcon = image(ASSET_PATHS.dealerCut1, "Dealer's Cut: first shot");
	dealerText = document.createElement("strong");
	dealerText.textContent = "1/3";
	dealer.append(dealerIcon, dealerText);

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

	deliveryLayer = document.createElement("div");
	deliveryLayer.className = "hud-deliveries";
	for (const delivery of deliveries.values()) delivery.remove();
	deliveries.clear();
	root.replaceChildren(health, cylinder, dealer, resourceRow, deliveryLayer);
}

export function updateHud(state: GameState, canvas?: HTMLCanvasElement): void {
	ensureHeartSlots(Math.max(1, Math.ceil(state.player.maxHealth / 20)));
    ensureAmmoSlots(state.cylinder.slots.length);
    for (const [index, icon] of hearts.entries()) {
		const heart = heartStateAt(state.player.health, index);
		const [src, alt] = heart === "full"
			? [ASSET_PATHS.heartFull, "Full heart"]
			: heart === "half"
				? [ASSET_PATHS.heartHalf, "Half heart"]
				: [ASSET_PATHS.heartEmpty, "Empty heart"];
		setAttributeIfChanged(icon, "src", src);
		setPropertyIfChanged(icon, "alt", alt);
	}
	for (const [index, icon] of ammo.entries()) {
		const slot = state.cylinder.slots[index]!;
		const projection = ammoStateAt(slot);
		setAttributeIfChanged(icon, "src", projection.src);
		setPropertyIfChanged(icon, "alt", projection.alt);
		const existingEcho = ammoEchoes[index];
		if (slot.loaded && slot.echo) {
			const overlay = existingEcho ?? image(ASSET_PATHS.ammoEcho, "Echo round");
			if (!existingEcho) {
				overlay.className = "ammo-echo";
				ammoTiles[index]?.append(overlay);
				ammoEchoes[index] = overlay;
			}
		} else if (existingEcho) {
			existingEcho.remove();
			ammoEchoes[index] = undefined;
		}
	}
	if (dealer && dealerIcon && dealerText) {
		const projection = dealerStateAt(state.dealerCounter);
		setPropertyIfChanged(dealer, "hidden", !state.artifacts.dealersCut);
		setAttributeIfChanged(dealerIcon, "src", projection.src);
		setPropertyIfChanged(dealerIcon, "alt", `Dealer's Cut: ${projection.text}`);
		setPropertyIfChanged(dealerText, "textContent", projection.text);
	}
	if (!resources) return;
	for (const key of ["coins", "bombs", "keys"] as const)
		setPropertyIfChanged(resources[key], "textContent", formatResource(state.resources[key]));

	const active = new Set<string>();
	if (canvas && deliveryLayer) {
		const canvasRect = canvas.getBoundingClientRect();
		for (const command of state.vfxCommands) {
			if (command.destination !== "hud" || command.expiresAt <= state.time) continue;
			const slot = ammoTiles[command.geometry.slot];
			if (!slot) continue;
			active.add(command.id);
			const projection = projectHudDelivery(
				command,
				canvasRect,
				slot.getBoundingClientRect(),
				state.time,
				projectViewport(state),
			);
			const element = deliveries.get(command.id) ?? image(ASSET_PATHS.goldSoul, "Bonanza Clip ammo return");
			element.className = `hud-delivery${projection.progress >= 1 ? " arrived" : ""}`;
			element.style.transform = `translate(-50%, -50%) translate(${projection.x}px, ${projection.y}px)`;
			if (!deliveries.has(command.id)) {
				element.setAttribute("aria-hidden", "true");
				deliveryLayer.append(element);
				deliveries.set(command.id, element);
			}
		}
	}
	for (const [id, element] of deliveries) {
		if (active.has(id)) continue;
		element.remove();
		deliveries.delete(id);
	}
}
