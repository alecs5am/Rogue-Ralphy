import "./styles.css";
import { loadAssets } from "./assets";
import { createGame, type GameState, updateGame } from "./game/simulation";
import { mountLab } from "./lab";
import { renderGame } from "./render";

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Game shell is missing ${selector}`);
	return element;
}

const canvas = required<HTMLCanvasElement>(document, "#game");
const hud = required<HTMLElement>(document, "#hud");
const hudHealth = required<HTMLElement>(hud, ".hud-health");
const hudAmmo = required<HTMLElement>(hud, ".hud-ammo");
const reloadBar = required<HTMLElement>(document, "#reload");
const reloadFill = required<HTMLElement>(reloadBar, ".reload-fill");
const reloadZone = required<HTMLElement>(reloadBar, ".reload-zone");
const pauseLabel = required<HTMLElement>(document, "#pause-label");
const quickdraw = required<HTMLElement>(document, "#quickdraw");
const context = (() => {
	const value = canvas.getContext("2d");
	if (!value) throw new Error("Canvas 2D is unavailable");
	return value;
})();

async function start(): Promise<void> {
	const assets = await loadAssets();
	let state: GameState = createGame();
	let paused = false;
	let reloadPressed = false;
	let firing = false;
	const pressed = new Set<string>();
	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
	const updateLab = mountLab(
		{
			get: () => state,
			set: (next) => {
				state = next;
			},
		},
		assets.missing,
	);

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
		if (event.button !== 0 || paused) return;
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
			paused = !paused;
			firing = false;
			state = { ...state, paused };
			canvas.blur();
		} else if (key === "r" && !event.repeat && !paused) reloadPressed = true;
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
		if (!paused) {
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

		const moving =
			pressed.has("w") ||
			pressed.has("a") ||
			pressed.has("s") ||
			pressed.has("d");
		renderGame(context, state, assets, { moving, reducedMotion });
		updateLab(state, paused);
		hudHealth.textContent = `HP ${state.player.health}`;
		hudAmmo.textContent = `${state.reload.ammo}/${state.reload.capacity}`;
		pauseLabel.hidden = !paused;
		quickdraw.hidden = state.time >= state.reload.buffUntil;
		reloadBar.hidden = !state.reload.reloading;
		if (state.reload.reloading) {
			const duration = state.reload.completesAt - state.reload.startedAt;
			const progress = Math.max(
				0,
				Math.min(1, (state.time - state.reload.startedAt) / duration),
			);
			reloadFill.style.width = `${progress * 100}%`;
			const zoneStart =
				(state.reload.sweetStart - state.reload.startedAt) / duration;
			const zoneWidth =
				(state.reload.sweetEnd - state.reload.sweetStart) / duration;
			reloadZone.style.left = `${zoneStart * 100}%`;
			reloadZone.style.width = `${zoneWidth * 100}%`;
			reloadZone.hidden = state.weapon.activeWindow === 0;
			reloadBar.classList.toggle(
				"in-zone",
				state.weapon.activeWindow > 0 &&
					state.time >= state.reload.sweetStart &&
					state.time <= state.reload.sweetEnd,
			);
		}
		requestAnimationFrame(frame);
	}

	requestAnimationFrame(frame);
}

void start();
