import { expect, test } from "bun:test";
import {
	ARTIFACT_HUD_ASSETS,
	ARTIFACT_PRESENTATION_ASSETS,
} from "./assets";
import { ARTIFACT_IDS } from "./game/artifacts";
import { projectEffectDraws } from "./render-effects";

const EXPECTED_PRESENTATION_ASSETS = [
	"echoFlash",
	"burstFlash",
	"sideShotFlash",
	"bellRing",
	"boneFan",
	"graveBloomVfx",
	"soulSpirit",
	"coinMint",
	"chillMark",
	"iceShatter",
	"burnMark",
	"emberRing",
	"wantedMark",
	"ledgerMark",
	"hexPulse",
	"hollowExplosion",
	"waveTrail",
	"cometTail",
	"returnLoop",
	"pinballRelay",
	"ectoplasmPool",
	"ectoplasmTrail",
	"crossfirePulse",
	"kineticExplosion",
	"ironMoonlet",
	"ghostSatellite",
	"recoilSkid",
	"stillwaterWard",
	"dustlineAfterimage",
	"goldSoul",
	"locketOrbital",
	"coatDecoy",
	"twinWeave",
	"orbitTrail",
	"homingMarker",
	"shotgunSplit",
	"spectralTrail",
	"teslaArc",
] as const;

test("presentation fixture is serializable, whitelisted, and covers every artifact cue", async () => {
	const fixtures = await import("./e2e-fixtures").catch(() => null);
	expect(fixtures).not.toBeNull();
	if (!fixtures) return;

	expect(JSON.parse(JSON.stringify(fixtures.E2E_FIXTURE_DESCRIPTIONS)))
		.toEqual(fixtures.E2E_FIXTURE_DESCRIPTIONS);
	expect(fixtures.materializeFixture(null)).toBeUndefined();
	expect(fixtures.materializeFixture("unknown")).toBeUndefined();
	expect(fixtures.materializeFixture('{"player":{"health":0}}')).toBeUndefined();

	const state = fixtures.materializeFixture("presentation-all");
	expect(state).toBeDefined();
	if (!state) return;
	expect(state.paused).toBe(true);
	expect(Object.keys(state.artifacts).sort()).toEqual([...ARTIFACT_IDS].sort());

	const draws = projectEffectDraws(state, false);
	expect(new Set(draws.map(({ artifactId }) => artifactId))).toEqual(
		new Set(ARTIFACT_IDS),
	);
	expect(new Set(draws.map(({ asset }) => asset))).toEqual(
		new Set(EXPECTED_PRESENTATION_ASSETS),
	);
	expect(ARTIFACT_PRESENTATION_ASSETS).toEqual(EXPECTED_PRESENTATION_ASSETS);
	expect(draws.find(({ artifactId }) => artifactId === "bonanzaClip")?.geometry.type)
		.toBe("hudDelivery");
	expect(ARTIFACT_HUD_ASSETS).toEqual([
		"ammoEcho",
		"dealerCut1",
		"dealerCut2",
		"dealerCut3",
	]);
	expect(state.cylinder.slots.every(({ loaded, echo }) => loaded && echo !== null)).toBe(true);
	expect(state.dealerCounter).toBe(2);
});

test("death fixture is deterministic and retains the complete loadout", async () => {
	const fixtures = await import("./e2e-fixtures").catch(() => null);
	expect(fixtures).not.toBeNull();
	if (!fixtures) return;
	const state = fixtures.materializeFixture("death-ready");
	expect(state).toMatchObject({
		paused: false,
		player: { health: 0, vx: 0, vy: 0 },
		diedAt: 1,
		time: 1,
	});
	expect(Object.keys(state?.artifacts ?? {})).toHaveLength(36);
});

test("reload fixture pauses an all-artifact manual reload at its timing midpoint", async () => {
	const fixtures = await import("./e2e-fixtures").catch(() => null);
	expect(fixtures).not.toBeNull();
	if (!fixtures) return;
	const state = fixtures.materializeFixture("reload-ready");
	expect(state).toMatchObject({
		paused: true,
		time: 0.75,
		cylinder: { reloading: true, reloadKind: "manual" },
	});
	expect(state?.cylinder.slots.filter(({ loaded }) => loaded)).toHaveLength(3);
	expect(state?.time).toBeGreaterThan(state?.cylinder.sweetStart ?? Number.POSITIVE_INFINITY);
	expect(state?.time).toBeLessThan(state?.cylinder.sweetEnd ?? Number.NEGATIVE_INFINITY);
});

test("demo fixture exposes the boss, reward crates, and pickup feedback", async () => {
	const fixtures = await import("./e2e-fixtures").catch(() => null);
	expect(fixtures).not.toBeNull();
	if (!fixtures) return;
	const state = fixtures.materializeFixture("demo-ready");
    expect(state?.run).toMatchObject({ mode: "run", phase: "combat", wave: 10 });
    expect(state?.targets.find(({ kind }) => kind === "sheriffBoss")).toMatchObject({
        health: 1_300,
        maxHealth: 2_600,
    });
	expect(state?.targets.filter(({ kind }) => kind === "destructibleCrate")).toHaveLength(2);
	expect(state?.pickupNotice?.text).toBe("+8% DAMAGE");
});

test("complete fixture exposes the final run state", async () => {
	const fixtures = await import("./e2e-fixtures").catch(() => null);
	expect(fixtures).not.toBeNull();
	if (!fixtures) return;
	const state = fixtures.materializeFixture("complete-ready");
	expect(state?.run).toMatchObject({ phase: "complete", wave: 10, artifactsTaken: 10 });
	expect(Object.keys(state?.artifacts ?? {})).toHaveLength(10);
});
