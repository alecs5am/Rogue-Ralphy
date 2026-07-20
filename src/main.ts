import "./styles.css";
import {
	loadAssets as loadProductionAssets,
	type LoadedAssets,
} from "./assets";
import { createGame, type GameState, updateGame } from "./game/simulation";
import { mountHud, updateHud } from "./hud";
import { mountLab } from "./lab";
import { renderGame } from "./render";

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Game shell is missing ${selector}`);
	return element;
}

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas 2D is unavailable");
	return context;
}

type BootstrapOptions = Readonly<{
	loadAssets: () => Promise<LoadedAssets>;
	requestFrame: (callback: FrameRequestCallback) => number;
}>;

export async function bootstrap({
	loadAssets,
	requestFrame,
}: BootstrapOptions): Promise<void> {
	let assets: LoadedAssets;
	try {
		assets = await loadAssets();
	} catch (error) {
		const app = document.querySelector<HTMLElement>("#app");
		if (!app) throw new Error("Game shell is missing #app");
		const alert = document.createElement("p");
		alert.className = "asset-failure";
		alert.setAttribute("role", "alert");
		alert.textContent = `Ralphy Combat Lab could not start: ${error instanceof Error ? error.message : String(error)}`;
		app.replaceChildren(alert);
		app.removeAttribute("aria-busy");
		return;
	}

	const app = required<HTMLElement>(document, "#app");
	const canvas = required<HTMLCanvasElement>(document, "#game");
	const hud = required<HTMLElement>(document, "#hud");
	const reloadBar = required<HTMLElement>(document, "#reload");
	const reloadFill = required<HTMLElement>(reloadBar, ".reload-fill");
	const reloadZone = required<HTMLElement>(reloadBar, ".reload-zone");
	const reloadLabel = required<HTMLElement>(reloadBar, "span");
	const pauseLabel = required<HTMLElement>(document, "#pause-label");
	const quickdraw = required<HTMLElement>(document, "#quickdraw");
	const context = canvasContext(canvas);
	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
	let state: GameState = createGame();
	mountHud(hud);
	updateHud(state, canvas);
	let reloadPressed = false;
	let firing = false;
	const pressed = new Set<string>();
	const updateLab = mountLab({
		get: () => state,
		set: (next) => {
			state = next;
		},
	});
	app.removeAttribute("aria-busy");

	function mapPointer(event: PointerEvent): void {
		const bounds = canvas.getBoundingClientRect();
		state = {
			...state,
			aim: {
				x: Math.max(
					0,
					Math.min(
						canvas.width,
						((event.clientX - bounds.left) * canvas.width) / bounds.width,
					),
				),
				y: Math.max(
					0,
					Math.min(
						canvas.height,
						((event.clientY - bounds.top) * canvas.height) / bounds.height,
					),
				),
			},
		};
	}

	canvas.addEventListener("pointermove", mapPointer);
	canvas.addEventListener("pointerdown", (event) => {
		if (event.button !== 0 || state.paused) return;
		mapPointer(event);
		firing = true;
		canvas.focus();
	});
	window.addEventListener("pointerup", (event) => {
		if (event.button === 0) firing = false;
	});
	canvas.addEventListener("contextmenu", (event) => event.preventDefault());

	window.addEventListener("keydown", (event) => {
		const key = event.key.toLowerCase();
		if (["w", "a", "s", "d", "r", "escape"].includes(key))
			event.preventDefault();
		if (key === "escape" && !event.repeat) {
			firing = false;
			reloadPressed = false;
			state = { ...state, paused: !state.paused };
			canvas.blur();
		} else if (key === "r" && !event.repeat && !state.paused)
			reloadPressed = true;
		pressed.add(key);
	});
	window.addEventListener("keyup", (event) =>
		pressed.delete(event.key.toLowerCase()),
	);
	window.addEventListener("blur", () => {
		pressed.clear();
		firing = false;
	});
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) {
			pressed.clear();
			firing = false;
			reloadPressed = false;
			state = { ...state, paused: true };
		}
		lastFrame = performance.now();
		accumulator = 0;
	});

	const STEP = 1 / 120;
	let accumulator = 0;
	let lastFrame = performance.now();

	function frame(timestamp: number): void {
		const elapsed = document.hidden
			? 0
			: Math.min(0.25, Math.max(0, (timestamp - lastFrame) / 1000));
		lastFrame = timestamp;
		if (!state.paused) {
			accumulator += elapsed;
			while (accumulator >= STEP) {
				state = updateGame(
					state,
					{
						moveX: Number(pressed.has("d")) - Number(pressed.has("a")),
						moveY: Number(pressed.has("s")) - Number(pressed.has("w")),
						aimX: state.aim.x,
						aimY: state.aim.y,
						firing,
						reloadPressed,
						paused: false,
					},
					STEP,
					state.time + STEP,
				);
				reloadPressed = false;
				accumulator -= STEP;
			}
		} else {
			accumulator = 0;
		}

		renderGame(context, state, assets, { reducedMotion });
		updateLab(state);
		updateHud(state, canvas);
		pauseLabel.hidden = !state.paused;
		quickdraw.hidden = state.time >= state.cylinder.buffUntil;
		const activeReloadStartedAt =
			state.cylinder.buffUntil - state.weapon.activeBuffDuration;
		const reloadSuccess =
			state.cylinder.fireRateBuff > 0 &&
			state.time >= activeReloadStartedAt &&
			state.time < activeReloadStartedAt + 0.22;
		reloadBar.hidden = !state.cylinder.reloading && !reloadSuccess;
		reloadBar.classList.toggle("success", reloadSuccess);
		reloadLabel.textContent = reloadSuccess ? "QUICKDRAW" : "RELOADING";
		if (reloadSuccess) {
			reloadFill.style.width = "100%";
			reloadZone.hidden = true;
			reloadBar.classList.remove("in-zone");
		} else if (state.cylinder.reloading) {
			const duration = state.cylinder.completesAt - state.cylinder.startedAt;
			const progress = Math.max(
				0,
				Math.min(1, (state.time - state.cylinder.startedAt) / duration),
			);
			reloadFill.style.width = `${progress * 100}%`;
			const zoneStart =
				(state.cylinder.sweetStart - state.cylinder.startedAt) / duration;
			const zoneWidth =
				(state.cylinder.sweetEnd - state.cylinder.sweetStart) / duration;
			reloadZone.style.left = `${zoneStart * 100}%`;
			reloadZone.style.width = `${zoneWidth * 100}%`;
			reloadZone.hidden = state.weapon.activeWindow === 0;
			reloadBar.classList.toggle(
				"in-zone",
				state.weapon.activeWindow > 0 &&
					state.time >= state.cylinder.sweetStart &&
					state.time <= state.cylinder.sweetEnd,
			);
		}
		requestFrame(frame);
	}

	requestFrame(frame);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
	void bootstrap({
		loadAssets: loadProductionAssets,
		requestFrame: window.requestAnimationFrame.bind(window),
	});
}
