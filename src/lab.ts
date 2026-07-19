import { ASSET_PATHS, type AssetKey } from "./assets";
import { ARTIFACT_CATALOG } from "./game/artifacts";
import { resetMetrics, summarizeMetrics } from "./game/metrics";
import {
	clearTargets,
	type GameState,
	resetLab,
	setArtifact,
	setArtifactLoadout,
	spawnChaser,
	spawnDummy,
	spawnWave,
} from "./game/simulation";
import type { ArtifactId, ArtifactLoadout } from "./game/weapon";

type StateAccess = { get: () => GameState; set: (state: GameState) => void };
const format = {
	number: (value: number, digits = 1) =>
		Number.isFinite(value) ? value.toFixed(digits) : "∞",
	percent: (value: number) => `${Math.round(value * 100)}%`,
	degrees: (value: number) => `${Math.round((value * 180) / Math.PI)}°`,
};

const button = (label: string, className = "") => {
	const element = document.createElement("button");
	element.type = "button";
	element.textContent = label;
	element.className = className;
	return element;
};

const sectionHeading = (id: string, title: string) =>
	`<div class="section-heading"><h2 id="${id}">${title}</h2><i aria-hidden="true"></i></div>`;

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Laboratory shell is missing ${selector}`);
	return element;
}

export function mountLab(
	access: StateAccess,
	missing: AssetKey[],
): (state: GameState) => void {
	const artifactsRoot = document.querySelector<HTMLElement>("#artifacts");
	const spawnerRoot = document.querySelector<HTMLElement>("#spawner");
	const statsRoot = document.querySelector<HTMLElement>("#stats");
	if (!artifactsRoot || !spawnerRoot || !statsRoot)
		throw new Error("Laboratory shell is incomplete");

	artifactsRoot.innerHTML = `${sectionHeading("artifacts-title", "Artifacts")}<div class="artifact-grid"></div><div class="action-row artifact-actions"></div>`;
	const grid = required<HTMLElement>(artifactsRoot, ".artifact-grid");
	const artifactControls = new Map<
		ArtifactId,
		{ card: HTMLElement; button: HTMLButtonElement }
	>();
	for (const artifact of ARTIFACT_CATALOG) {
		const card = document.createElement("article");
		card.className = "artifact-card";
		card.dataset.artifact = artifact.id;
		const iconKey = artifact.icon;
		const icon = missing.includes(iconKey)
			? '<span class="missing-icon" aria-hidden="true"></span>'
			: `<img src="${ASSET_PATHS[iconKey]}" alt="">`;
		card.innerHTML = `${icon}<div class="artifact-copy"><h3>${artifact.name}</h3><p>${artifact.description}</p></div>`;
		const artifactButton = button("Take", "artifact-toggle");
		artifactButton.setAttribute("aria-label", `Take ${artifact.name}`);
		artifactButton.addEventListener("click", () => {
			const state = access.get();
			access.set(setArtifact(state, artifact.id, !state.artifacts[artifact.id]));
		});
		card.append(artifactButton);
		grid.append(card);
		artifactControls.set(artifact.id, { card, button: artifactButton });
	}

	const artifactActions = required<HTMLElement>(
		artifactsRoot,
		".artifact-actions",
	);
	const takeAll = button("Take all");
	takeAll.addEventListener("click", () => {
		const loadout = Object.fromEntries(
			ARTIFACT_CATALOG.map(({ id }) => [id, true]),
		) as ArtifactLoadout;
		access.set(setArtifactLoadout(access.get(), loadout));
	});
	const clearArtifacts = button("Clear artifacts");
	clearArtifacts.addEventListener("click", () =>
		access.set(setArtifactLoadout(access.get(), {})),
	);
	artifactActions.append(takeAll, clearArtifacts);

	spawnerRoot.innerHTML = `${sectionHeading("spawner-title", "Test targets")}<div class="action-grid"></div><div class="action-row room-actions"></div>`;
	const spawnActions: [string, (state: GameState) => GameState][] = [
		["Spawn dummy", spawnDummy],
		["Spawn chaser", spawnChaser],
		["Spawn wave ×5", spawnWave],
		["Clear targets", clearTargets],
	];
	const spawnGrid = required<HTMLElement>(spawnerRoot, ".action-grid");
	for (const [label, action] of spawnActions) {
		const element = button(label);
		element.addEventListener("click", () => access.set(action(access.get())));
		spawnGrid.append(element);
	}
	const resetMetricsButton = button("Reset metrics");
	resetMetricsButton.addEventListener("click", () => {
		const state = access.get();
		const metrics = resetMetrics(state.metrics);
		access.set({
			...state,
			metrics,
			telemetry: summarizeMetrics(metrics, state.time),
		});
	});
	const resetLabButton = button("Reset lab", "danger");
	resetLabButton.addEventListener("click", () =>
		access.set(resetLab(access.get())),
	);
	required<HTMLElement>(spawnerRoot, ".room-actions").append(
		resetMetricsButton,
		resetLabButton,
	);

	const statRows = [
		["rolling-dps", "Rolling DPS"],
		["peak-dps", "Peak DPS"],
		["total-damage", "Total damage"],
		["triggers", "Triggers"],
		["projectiles", "Projectiles"],
		["hits", "Hits"],
		["secondary-hits", "Secondary hits"],
		["misses", "Misses"],
		["accuracy", "Accuracy"],
		["kills", "Kills"],
		["active", "Active shots"],
		["health", "Health"],
		["ammo", "Ammo"],
		["reload-state", "Reload"],
		["move-speed", "Move speed"],
		["damage", "Damage"],
		["rate", "Fire rate"],
		["count", "Shot count"],
		["multishot", "Multishot"],
		["spread", "Spread"],
		["size", "Shot radius"],
		["speed", "Shot speed"],
		["lifetime", "Lifetime"],
		["bounce", "Bounce"],
		["freeze", "Freeze"],
		["tesla", "Tesla"],
		["split", "Split"],
		["penetration", "Penetration"],
		["spiral", "Spiral"],
		["homing", "Homing"],
		["deadeye", "Deadeye"],
	] as const;
	statsRoot.innerHTML = `${sectionHeading("stats-title", "Live telemetry")}<dl class="stats-list">${statRows.map(([key, label]) => `<div><dt>${label}</dt><dd data-stat="${key}"${key === "total-damage" ? ' data-testid="total-damage"' : ""}>0</dd></div>`).join("")}</dl><div class="dummy-stats" aria-live="polite"></div><p id="asset-diagnostics" class="diagnostics"></p>`;
	const values: Record<string, HTMLElement> = {};
	for (const element of statsRoot.querySelectorAll<HTMLElement>(
		"[data-stat]",
	)) {
		if (element.dataset.stat) values[element.dataset.stat] = element;
	}
	const dummyStats = required<HTMLElement>(statsRoot, ".dummy-stats");
	required<HTMLElement>(statsRoot, "#asset-diagnostics").textContent =
		missing.length
			? `MISSING ASSETS: ${missing.join(", ")}`
			: `All generated assets loaded · ${Object.keys(ASSET_PATHS).length}/${Object.keys(ASSET_PATHS).length}`;

	return (state) => {
		for (const artifact of ARTIFACT_CATALOG) {
			const control = artifactControls.get(artifact.id);
			if (!control) continue;
			const owned = state.artifacts[artifact.id] === true;
			control.card.classList.toggle("active", owned);
			control.button.textContent = owned ? "Remove" : "Take";
			control.button.setAttribute(
				"aria-label",
				`${owned ? "Remove" : "Take"} ${artifact.name}`,
			);
		}
		const telemetry = state.telemetry;
		const reloadProgress = state.reload.reloading
			? Math.min(
					1,
					(state.time - state.reload.startedAt) /
						(state.reload.completesAt - state.reload.startedAt),
				)
			: 0;
		const buffRemaining = Math.max(0, state.reload.buffUntil - state.time);
		const stats: Record<string, string> = {
			"rolling-dps": format.number(telemetry.rollingDps),
			"peak-dps": format.number(telemetry.peakDps),
			"total-damage": format.number(telemetry.totalDamage, 0),
			triggers: String(telemetry.triggers),
			projectiles: String(telemetry.projectiles),
			hits: String(telemetry.hits),
			"secondary-hits": String(telemetry.secondaryHits),
			misses: String(telemetry.misses),
			accuracy: format.percent(telemetry.accuracy),
			kills: String(telemetry.kills),
			active: String(state.projectiles.length),
			health: `${state.player.health}/${state.player.maxHealth}`,
			ammo: `${state.reload.ammo}/${state.reload.capacity}`,
			"reload-state": state.paused
				? `PAUSED · ${state.weapon.reloadDuration}s`
				: state.reload.reloading
					? `${Math.round(reloadProgress * 100)}% · ${state.weapon.reloadDuration}s`
					: `READY · ${state.weapon.reloadDuration}s`,
			"move-speed": `${state.player.speed} px/s`,
			damage: format.number(state.weapon.damage),
			rate: `${format.number(state.weapon.fireRate, 2)}/s`,
			count: String(state.weapon.projectileCount),
			multishot: `${state.weapon.multishot.toFixed(2)}× · ${Math.round((state.weapon.multishot % 1) * 100)}% extra`,
			spread: format.degrees(state.weapon.spread),
			size: `${format.number(state.weapon.radius)} px`,
			speed: `${state.weapon.speed} px/s`,
			lifetime: `${state.weapon.lifetime}s`,
			bounce: `${state.weapon.bounces} × ${format.percent(state.weapon.bounceRetention)}`,
			freeze: `${format.percent(state.weapon.freezeChance)} · ${format.number(state.weapon.freezeDuration)}s`,
			tesla: state.weapon.behaviors.tesla
				? `${state.weapon.behaviors.tesla.radius} px radius · max ${state.weapon.behaviors.tesla.neighbors} links · ${format.percent(state.weapon.behaviors.tesla.damageScale)} damage · ${format.number(state.weapon.behaviors.tesla.cooldown, 2)}s cooldown`
				: "OFF",
			split: state.weapon.behaviors.split
				? `${state.weapon.behaviors.split.distance} px distance · ${state.weapon.behaviors.split.count} pellets · ${state.weapon.behaviors.split.childRange} px child range · ${format.degrees(state.weapon.behaviors.split.fanAngle)} cone · ${format.percent(state.weapon.behaviors.split.damageScale)} damage · ${format.percent(state.weapon.behaviors.split.radiusScale)} size`
				: "OFF",
			penetration: state.weapon.behaviors.penetration
				? `${state.weapon.behaviors.penetration.obstacles ? "COVER" : ""}${state.weapon.behaviors.penetration.obstacles && state.weapon.behaviors.penetration.targets ? " + " : ""}${state.weapon.behaviors.penetration.targets ? "TARGETS" : ""}`
				: "OFF",
			spiral: state.weapon.behaviors.spiral
				? `${state.weapon.behaviors.spiral.lifetime}s duration · ${state.weapon.behaviors.spiral.radialSpeed} px/s growth`
				: "OFF",
			homing: state.weapon.behaviors.homing
				? `${format.degrees(state.weapon.behaviors.homing.turnRate)}/s · ${state.weapon.behaviors.homing.radius}px`
				: "OFF",
			deadeye: state.weapon.activeWindow
				? `${format.percent(state.weapon.activeWindow)} · +${format.percent(state.weapon.activeBuff)} · ${format.number(buffRemaining)}s`
				: "OFF",
		};
		for (const [key, value] of Object.entries(stats))
			if (values[key] && values[key].textContent !== value)
				values[key].textContent = value;
		const dummies = state.targets.filter((target) => target.kind === "dummy");
		const dummyProjection = dummies.length
			? `<h3>Dummy readout</h3>${dummies
					.map((target) => {
						const metric = telemetry.targets[target.id];
						return `<p><span>${target.id}</span><strong>${format.number(metric?.damage ?? 0, 0)} DMG · ${format.number(metric?.rollingDps ?? 0)} DPS</strong></p>`;
					})
					.join("")}`
			: "";
		if (dummyStats.innerHTML !== dummyProjection)
			dummyStats.innerHTML = dummyProjection;
	};
}
