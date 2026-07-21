import "./styles.css";
import {
    ASSET_PATHS,
    loadAssets as loadProductionAssets,
    type LoadedAssets,
} from "./assets";
import { ARTIFACT_CATALOG } from "./game/artifacts";
import { chooseRunArtifact, createGame, createRunGame, type GameState, updateGame } from "./game/simulation";
import { mountHud, updateHud } from "./hud";
import { mountLab } from "./lab";
import { projectViewport, renderGame } from "./render";

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
	resolveInitialState?: () => Promise<GameState | undefined>;
}>;

export async function bootstrap({
	loadAssets,
	requestFrame,
	resolveInitialState,
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
	let state: GameState = (await resolveInitialState?.()) ?? createGame();

	const app = required<HTMLElement>(document, "#app");
	const canvas = required<HTMLCanvasElement>(document, "#game");
    const hud = required<HTMLElement>(document, "#hud");
    const mainMenu = required<HTMLElement>(document, "#main-menu");
    const runChoice = required<HTMLElement>(document, "#run-choice");
    const runBanner = required<HTMLElement>(document, "#run-banner");
	const bossHud = required<HTMLElement>(document, "#boss-hud");
	const bossPhase = required<HTMLElement>(bossHud, "span");
	const bossFill = required<HTMLElement>(bossHud, ".boss-track i");
	const pickupToast = required<HTMLElement>(document, "#pickup-toast");
	const menuButton = required<HTMLButtonElement>(document, "#menu-button");
	const reloadBar = required<HTMLElement>(document, "#reload");
	const reloadFill = required<HTMLElement>(reloadBar, ".reload-fill");
	const reloadZone = required<HTMLElement>(reloadBar, ".reload-zone");
	const reloadLabel = required<HTMLElement>(reloadBar, "span");
	const pauseLabel = required<HTMLElement>(document, "#pause-label");
	const pauseTitle = required<HTMLElement>(pauseLabel, "h2");
	const resumeButton = required<HTMLButtonElement>(pauseLabel, '[data-action="resume"]');
	const restartButton = required<HTMLButtonElement>(pauseLabel, '[data-action="restart"]');
	const pauseMenuButton = required<HTMLButtonElement>(pauseLabel, '[data-action="menu"]');
	const quickdraw = required<HTMLElement>(document, "#quickdraw");
	const context = canvasContext(canvas);
	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    mountHud(hud);
    updateHud(state, canvas);
    let reloadPressed = false;
    let firing = false;
    const startsFromFixture = new URLSearchParams(location.search).has("fixture");
    let mode: "menu" | "run" | "lab" = state.run ? "run" : startsFromFixture ? "lab" : "menu";
    const pressed = new Set<string>();
	const updateLab = mountLab({
		get: () => state,
		set: (next) => {
			state = next;
		},
	});
    app.removeAttribute("aria-busy");
    app.dataset.mode = mode;
	menuButton.hidden = mode === "menu";

    function setMode(nextMode: typeof mode): void {
        mode = nextMode;
        app.dataset.mode = mode;
		menuButton.hidden = mode === "menu";
        firing = false;
        pressed.clear();
    }

	function returnToMenu(): void {
		state = { ...state, paused: false };
		setMode("menu");
		canvas.blur();
	}

	function restartSession(): void {
		state = mode === "run" ? createRunGame(state.rng) : createGame(state.rng);
		setMode(mode);
		canvas.focus();
	}

    function updateRunChoice(): void {
        const run = state.run;
        runBanner.hidden = mode !== "run";
        if (mode === "run" && run) {
			const enemiesCleared = !state.targets.some((target) => !target.immortal && target.kind !== "destructibleCrate");
            runBanner.textContent = run.phase === "complete"
                ? "RUN COMPLETE"
				: run.phase === "combat" && enemiesCleared && state.pickups.length > 0
					? `COLLECT BONUS · ${state.pickups.length} LEFT`
					: `WAVE ${run.wave} · ARTIFACTS ${run.artifactsTaken}/${run.maxArtifacts} · BONUSES ${run.bonusDrops}`;
        }
        if (mode !== "run" || !run || run.phase !== "choice") {
            runChoice.hidden = true;
            runChoice.replaceChildren();
            delete runChoice.dataset.signature;
            return;
        }
        runChoice.hidden = false;
        const choices = run.choices.length > 0 ? run.choices : [];
        const signature = `${run.wave}:${choices.join(",")}:${run.artifactsTaken}`;
        if (runChoice.dataset.signature === signature) return;
        runChoice.dataset.signature = signature;
        const title = document.createElement("h2");
        title.textContent = `Wave ${run.wave}`;
        const row = document.createElement("div");
        row.className = "choice-row";
        if (choices.length === 0) {
            const start = document.createElement("button");
            start.type = "button";
            start.textContent = "Start wave";
            start.addEventListener("click", () => { state = chooseRunArtifact(state); });
            row.append(start);
        } else {
            for (const id of choices) {
                const artifact = ARTIFACT_CATALOG.find((candidate) => candidate.id === id)!;
                const option = document.createElement("button");
                option.type = "button";
                option.className = "choice-card";
                const image = document.createElement("img");
                image.src = ASSET_PATHS[artifact.icon];
                image.alt = "";
                const label = document.createElement("strong");
                label.textContent = artifact.name;
                const description = document.createElement("span");
                description.textContent = artifact.description;
                option.append(image, label, description);
                option.addEventListener("click", () => { state = chooseRunArtifact(state, id); });
                row.append(option);
            }
        }
        runChoice.replaceChildren(title, row);
    }

    required<HTMLButtonElement>(mainMenu, '[data-action="play"]').addEventListener("click", () => {
        state = createRunGame(state.rng);
        setMode("run");
        canvas.focus();
    });
    required<HTMLButtonElement>(mainMenu, '[data-action="lab"]').addEventListener("click", () => {
        state = createGame(state.rng);
        setMode("lab");
        canvas.focus();
    });
	menuButton.addEventListener("click", returnToMenu);
	pauseMenuButton.addEventListener("click", returnToMenu);
	resumeButton.addEventListener("click", () => {
		state = { ...state, paused: false };
		canvas.focus();
	});
	restartButton.addEventListener("click", restartSession);

	function mapPointer(event: PointerEvent): void {
        const bounds = canvas.getBoundingClientRect();
        const viewport = projectViewport(state);
        state = {
            ...state,
            aim: {
                x: viewport.x + Math.max(
                    0,
                    Math.min(
                        canvas.width,
						((event.clientX - bounds.left) * canvas.width) / bounds.width,
					),
				),
                y: viewport.y + Math.max(
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
        if (event.button !== 0 || state.paused || mode === "menu" || state.run?.phase === "choice" || state.run?.phase === "complete") return;
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
        if (mode === "menu") return;
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
		if (mode !== "menu" && !state.paused && state.run?.phase !== "choice" && state.run?.phase !== "complete") {
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
        updateRunChoice();
        updateHud(state, canvas);
		const boss = state.targets.find((target) => target.kind === "sheriffBoss");
		bossHud.hidden = mode !== "run" || !boss;
		if (boss) {
			const ratio = Math.max(0, Math.min(1, boss.health / boss.maxHealth));
			const phase = ratio > 0.67 ? 1 : ratio > 0.34 ? 2 : 3;
			bossPhase.textContent = `PHASE ${phase}`;
			bossFill.style.width = `${ratio * 100}%`;
		}
		const notice = state.pickupNotice;
		pickupToast.hidden = mode === "menu" || !notice || notice.expiresAt <= state.time;
		if (notice) pickupToast.textContent = notice.text;
		const runComplete = state.run?.phase === "complete";
		const playerDied = state.player.health <= 0;
		const sessionPanelVisible = mode !== "menu" && (state.paused || runComplete || playerDied);
		pauseLabel.hidden = !sessionPanelVisible;
		pauseTitle.textContent = runComplete ? "RUN COMPLETE" : playerDied ? "RALPHY FELL" : "PAUSED";
		resumeButton.hidden = runComplete || playerDied;
		restartButton.textContent = mode === "run"
			? runComplete || playerDied ? "Play again" : "Restart run"
			: "Reset test room";
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
		resolveInitialState: __RALPHY_E2E_BUILD__ &&
			import.meta.env.VITE_E2E_FIXTURES === "1"
			? async () => {
				const fixtures = await import("./e2e-fixtures");
				void fixtures.E2E_FIXTURE_MARKER;
				return fixtures.materializeFixture(
					new URLSearchParams(window.location.search).get("fixture"),
				);
			}
			: undefined,
	});
}
