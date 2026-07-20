import { describe, expect, test } from "bun:test";

import {
  ARTIFACT_HUD_ASSETS,
  ARTIFACT_PRESENTATION_ASSETS,
} from "./assets";
import { ARTIFACT_CATALOG, type ArtifactId } from "./game/artifacts";
import type { ProjectileState } from "./game/projectiles";
import {
  createGame,
  setArtifactLoadout,
  updateGame,
  type GameState,
} from "./game/simulation";
import { createTargetEffects } from "./game/statuses";
import {
  ARTIFACT_EFFECT_CONTRACT,
  projectEffectDraws,
} from "./render-effects";

const expectedAssets: Record<ArtifactId, readonly string[]> = {
  twinChamber: ["twinWeave"],
  deadeye: ["echoFlash", "ammoEcho"],
  lastBell: ["bellRing"],
  graveEcho: ["echoFlash"],
  fanThePhantom: ["burstFlash"],
  dealersCut: ["sideShotFlash", "dealerCut1", "dealerCut2", "dealerCut3"],
  haloChamber: ["orbitTrail"],
  ghostSight: ["homingMarker"],
  pinball: ["pinballRelay"],
  wailingLead: ["waveTrail"],
  undertakersReturn: ["returnLoop"],
  cometSpur: ["cometTail"],
  shotgun: ["shotgunSplit"],
  hollowPoint: ["hollowExplosion"],
  boneOrchard: ["boneFan"],
  graveBloom: ["graveBloomVfx"],
  soulHarvester: ["soulSpirit"],
  bootlegMint: ["coinMint"],
  coldcaster: ["chillMark", "iceShatter"],
  cinderGospel: ["burnMark", "emberRing"],
  wantedBrand: ["wantedMark"],
  widowsLedger: ["ledgerMark"],
  ectoplasmSnare: ["ectoplasmPool"],
  hexBell: ["hexPulse"],
  spectralBullets: ["spectralTrail"],
  teslaBullets: ["teslaArc"],
  bigIron: ["ironMoonlet", "kineticExplosion"],
  ghostPosse: ["ghostSatellite"],
  ectoplasmicWake: ["ectoplasmTrail"],
  crossfireCovenant: ["crossfirePulse"],
  recoilBoots: ["recoilSkid"],
  stillwater: ["stillwaterWard"],
  dustlineDuel: ["dustlineAfterimage"],
  bonanzaClip: ["goldSoul"],
  lastGaspLocket: ["locketOrbital"],
  undertakersCoat: ["coatDecoy"],
};

const expectedContract = [
  ["twinChamber", "projectileMotion", "trigger", "projectiles", true, "freeze"],
  ["deadeye", "projectileMotion", "trigger", "emission-cues", true, "freeze"],
  ["lastBell", "VfxCommand", "trigger", "emission-cues", true, "freeze"],
  ["graveEcho", "projectileMotion", "trigger", "emission-cues", true, "freeze"],
  ["fanThePhantom", "projectileMotion", "trigger", "emission-cues", false, "freeze"],
  ["dealersCut", "projectileMotion", "trigger", "emission-cues", true, "freeze"],
  ["haloChamber", "projectileMotion", "motion", "projectiles", true, "freeze"],
  ["ghostSight", "projectileMotion", "motion", "target-cues", true, "freeze"],
  ["pinball", "VfxCommand", "motion", "links", true, "freeze"],
  ["wailingLead", "projectileMotion", "motion", "projectiles", false, "freeze"],
  ["undertakersReturn", "projectileMotion", "motion", "projectiles", true, "freeze"],
  ["cometSpur", "projectileMotion", "motion", "projectiles", false, "freeze"],
  ["shotgun", "VfxCommand", "impact", "emission-cues", true, "freeze"],
  ["hollowPoint", "VfxCommand", "impact", "areas-trails", true, "freeze"],
  ["boneOrchard", "projectileMotion", "impact", "emission-cues", false, "freeze"],
  ["graveBloom", "projectileMotion", "impact", "emission-cues", false, "freeze"],
  ["soulHarvester", "projectileMotion", "impact", "emission-cues", true, "freeze"],
  ["bootlegMint", "projectileMotion", "impact", "emission-cues", false, "freeze"],
  ["coldcaster", "VfxCommand", "status", "target-cues", true, "freeze"],
  ["cinderGospel", "VfxCommand", "status", "target-cues", true, "freeze"],
  ["wantedBrand", "targetStatus", "status", "target-cues", true, "preserve"],
  ["widowsLedger", "VfxCommand", "status", "target-cues", true, "freeze"],
  ["ectoplasmSnare", "area", "status", "areas-trails", true, "preserve"],
  ["hexBell", "VfxCommand", "status", "target-cues", true, "freeze"],
  ["spectralBullets", "projectileMotion", "relation", "projectiles", true, "freeze"],
  ["teslaBullets", "link", "relation", "links", true, "freeze"],
  ["bigIron", "projectileMotion", "relation", "projectiles", true, "freeze"],
  ["ghostPosse", "satellite/orbital", "relation", "satellites-orbitals-decoy", true, "freeze"],
  ["ectoplasmicWake", "area", "relation", "areas-trails", true, "shorten-trail"],
  ["crossfireCovenant", "area", "relation", "areas-trails", true, "freeze"],
  ["recoilBoots", "VfxCommand", "reactive", "emission-cues", false, "freeze"],
  ["stillwater", "VfxCommand", "reactive", "satellites-orbitals-decoy", true, "freeze"],
  ["dustlineDuel", "VfxCommand", "reactive", "emission-cues", true, "freeze"],
  ["bonanzaClip", "HUD", "reactive", "hud", true, "preserve"],
  ["lastGaspLocket", "satellite/orbital", "reactive", "satellites-orbitals-decoy", true, "freeze"],
  ["undertakersCoat", "decoy", "reactive", "satellites-orbitals-decoy", true, "preserve"],
] as const;

const projectile = (
  id: string,
  overrides: Partial<ProjectileState> = {},
): ProjectileState => ({
  id,
  triggerId: `trigger:${id}`,
  x: 280,
  y: 220,
  vx: 400,
  vy: 0,
  speed: 400,
  radius: 8,
  damage: 1,
  lifetime: 2,
  bornAt: 0.5,
  rootTriggerId: `root:${id}`,
  lineageId: `lineage:${id}`,
  localOrdinal: 0,
  generation: 0,
  originPower: 1,
  activatedEffectIds: [],
  reactiveEffectIds: [],
  emittedEffectIds: [],
  behaviors: {},
  remainingBounces: 0,
  bounceRetention: 1,
  freezeChance: 0,
  freezeDuration: 0,
  hitTargetIds: [],
  everHit: false,
  travelled: 80,
  maxTravel: 600,
  ...overrides,
});

const withState = (overrides: Partial<GameState>): GameState => ({
  ...createGame(() => 0.9),
  time: 1,
  ...overrides,
});

describe("artifact presentation contract", () => {
  test("is a typed, exact 36-row contract over the catalog", () => {
    expect(ARTIFACT_EFFECT_CONTRACT.map((row) => row.artifactId)).toEqual(
      ARTIFACT_CATALOG.map((artifact) => artifact.id),
    );
    expect(Object.fromEntries(
      ARTIFACT_EFFECT_CONTRACT.map((row) => [row.artifactId, row.assets]),
    ) as unknown as Record<ArtifactId, readonly string[]>).toEqual(expectedAssets);
    expect(ARTIFACT_EFFECT_CONTRACT.map((row) => [
      row.artifactId,
      row.source,
      row.family,
      row.layer,
      row.essential,
      row.reducedMotion,
    ])).toEqual(expectedContract.map((row) => [...row]));

    const catalogFamily = new Map(
      ARTIFACT_CATALOG.map((artifact) => [artifact.id, artifact.family]),
    );
    for (const row of ARTIFACT_EFFECT_CONTRACT) {
      expect(row.family).toBe(catalogFamily.get(row.artifactId)!);
      expect(row.assets.length).toBeGreaterThan(0);
      expect(row.layer.length).toBeGreaterThan(0);
      expect(row.reducedMotion).toMatch(/^(preserve|freeze|shorten-trail)$/);
    }
  });

  test("uses all and only generated presentation/HUD assets", () => {
    const used = new Set(ARTIFACT_EFFECT_CONTRACT.flatMap((row) => row.assets));
    expect([...used].sort()).toEqual(
      [...ARTIFACT_PRESENTATION_ASSETS, ...ARTIFACT_HUD_ASSETS].sort(),
    );

    const deadeye = ARTIFACT_EFFECT_CONTRACT.find((row) => row.artifactId === "deadeye");
    const grave = ARTIFACT_EFFECT_CONTRACT.find((row) => row.artifactId === "graveEcho");
    expect(deadeye?.assets).toContain("echoFlash");
    expect(grave?.assets).toContain("echoFlash");
    expect(deadeye?.artifactId).not.toBe(grave?.artifactId);
  });
});

describe("effect draw projection", () => {
  test("projects a representative trigger, motion, impact, status, relation, and reactive cue", () => {
    const state = withState({
      targets: [{
        id: "dummy",
        x: 440,
        y: 220,
        radius: 24,
        health: 20,
        maxHealth: 20,
        kind: "dummy",
        immortal: true,
        speed: 0,
        frozenUntil: 0,
        effects: createTargetEffects(),
      }],
      projectiles: [
        projectile("twin", { activatedEffectIds: ["twinChamber.pair"] }),
        projectile("halo", { activatedEffectIds: ["haloChamber.spiral"] }),
        projectile("tesla-a", { x: 300 }),
        projectile("tesla-b", { x: 390, damage: 2 }),
      ],
      teslaLinks: [{
        id: "link-1",
        a: "tesla-a",
        b: "tesla-b",
        distance: 90,
        damageScale: 0.25,
        cooldown: 0.15,
      }],
      vfxCommands: [
        {
          id: "impact-1",
          artifactId: "hollowPoint",
          effectId: "hollowPoint.explosion",
          rootTriggerId: "root:impact",
          bornAt: 0.8,
          expiresAt: 1.3,
          destination: "world",
          kind: "hollowPoint.explosion",
          geometry: { type: "radius", center: { x: 360, y: 220 }, radius: 72 },
        },
        {
          id: "status-1",
          artifactId: "cinderGospel",
          effectId: "cinderGospel.burn",
          rootTriggerId: "root:status",
          bornAt: 0.8,
          expiresAt: 1.3,
          destination: "world",
          kind: "cinderGospel.burn",
          geometry: { type: "target", targetId: "dummy", at: { x: 100, y: 100 } },
        },
        {
          id: "reactive-1",
          artifactId: "stillwater",
          effectId: "stillwater.ward",
          rootTriggerId: "root:ward",
          bornAt: 0.8,
          expiresAt: 1.3,
          destination: "world",
          kind: "stillwater.ward",
          geometry: { type: "point", at: { x: 510, y: 280 } },
        },
      ],
    });

    expect(new Set(projectEffectDraws(state, false).map((draw) => draw.family))).toEqual(
      new Set(["trigger", "motion", "impact", "status", "relation", "reactive"]),
    );
  });

  test("keeps shared echo art attributed to the originating artifact and root", () => {
    const draws = projectEffectDraws(withState({
      projectiles: [
        projectile("deadeye", {
          emission: { artifactId: "deadeye", effectId: "deadeye.echo" },
          rootTriggerId: "root:deadeye",
        }),
        projectile("grave", {
          emission: { artifactId: "graveEcho", effectId: "graveEcho.echo" },
          rootTriggerId: "root:grave",
        }),
      ],
    }), false).filter((draw) => draw.asset === "echoFlash");

    expect(draws.map(({ artifactId, rootTriggerId }) => ({ artifactId, rootTriggerId }))
      .sort((a, b) => a.artifactId.localeCompare(b.artifactId))).toEqual([
      { artifactId: "deadeye", rootTriggerId: "root:deadeye" },
      { artifactId: "graveEcho", rootTriggerId: "root:grave" },
    ]);
  });

  test("does not infer Shotgun or Spectral cues from generic projectile shape", () => {
    const draws = projectEffectDraws(withState({
      projectiles: [
        projectile("shotgun-valid", {
          splitParentId: "parent",
          activatedEffectIds: ["shotgun.split"],
        }),
        projectile("shotgun-emission", {
          splitParentId: "parent",
          activatedEffectIds: ["shotgun.split"],
          emission: { artifactId: "boneOrchard", effectId: "boneOrchard.fan" },
        }),
        projectile("shotgun-unactivated", { splitParentId: "parent" }),
        projectile("spectral-valid", {
          penetration: { obstacles: true, targets: true },
          activatedEffectIds: ["spectralBullets.penetration"],
        }),
        projectile("spectral-generic", { penetration: { obstacles: true, targets: true } }),
      ],
    }), false);

    expect(draws.filter((draw) => draw.asset === "shotgunSplit").map((draw) => draw.id)).toEqual([
      "projectile:shotgun-valid:shotgun.split",
    ]);
    expect(draws.filter((draw) => draw.asset === "spectralTrail").map((draw) => draw.id)).toEqual([
      "projectile:spectral-valid:spectralBullets.penetration",
    ]);
  });

  test("keeps the real Shotgun split cue visible after the pending emission is drained", () => {
    let game = setArtifactLoadout(createGame(() => 0.9), { shotgun: true });
    const intent = {
      moveX: 0, moveY: 0, aimX: 900, aimY: 288,
      firing: false, reloadPressed: false, paused: false,
    };
    const step = 1 / 120;
    for (let tick = 0; tick < 90 && !game.pendingEmissions.some(({ effectId }) => effectId === "shotgun.split"); tick += 1) {
      game = updateGame(game, { ...intent, firing: tick === 0 }, step, game.time + step);
    }
    const pending = game.pendingEmissions.find(({ effectId }) => effectId === "shotgun.split")!;
    const child = pending.templates?.[0]!;
    expect(child).toMatchObject({
      emission: { artifactId: "shotgun", effectId: "shotgun.split" },
    });
    expect(typeof child.splitOrigin?.x).toBe("number");
    expect(typeof child.splitOrigin?.y).toBe("number");
    expect(child.activatedEffectIds).not.toContain("shotgun.split");
    game = updateGame(game, intent, step, game.time + step);
    expect(game.pendingEmissions.some(({ effectId }) => effectId === "shotgun.split")).toBe(false);
    const command = game.vfxCommands.find(({ kind }) => kind === "shotgun.split")!;
    const draws = projectEffectDraws(game, false);
    const split = draws.find((draw) => draw.id === `command:${command.id}`)!;

    expect(split).toMatchObject({
      id: `command:${command.id}`,
      artifactId: "shotgun",
      rootTriggerId: pending.rootTriggerId,
      lineageId: pending.lineageId,
      bornAt: command.bornAt,
      expiresAt: command.expiresAt,
      geometry: { type: "sprite", x: child.splitOrigin!.x, y: child.splitOrigin!.y },
    });
    expect(split.expiresAt - split.bornAt).toBeCloseTo(0.2, 10);
  });

  test("projects exactly one Big Iron cue per main and moonlet body", () => {
    const draws = projectEffectDraws(withState({
      projectiles: [
        projectile("iron-main", {
          moonletId: "iron-moonlet",
          bigIronMain: { moonletId: "iron-moonlet", mainDamage: 4, heading: 0 },
        }),
        projectile("iron-moonlet", {
          moonlet: {
            mainId: "iron-main",
            parentId: "iron-main",
            orbitRadius: 24,
            angularSpeed: 4,
            angle: 0,
            expiresAt: 2,
            remainingRange: 300,
            mainDamage: 4,
            pairWindow: 0.2,
            explosionRadius: 48,
            explosionDamageScale: 0.5,
            knockback: 100,
          },
        }),
      ],
    }), false).filter((draw) => draw.asset === "ironMoonlet");

    expect(draws.map((draw) => draw.id)).toEqual([
      "projectile:iron-main:bigIron.heavy",
      "projectile:iron-moonlet:bigIron.moonletOrbit",
    ]);
  });

  test("matches Twin and Halo by exact effect ID instead of parsing prefixes", () => {
    const draws = projectEffectDraws(withState({
      projectiles: [
        projectile("fake-prefixes", {
          activatedEffectIds: ["twinChamber.unrelated", "haloChamber.unrelated"],
        }),
        projectile("exact-effects", {
          activatedEffectIds: ["twinChamber.pair", "haloChamber.spiral"],
        }),
      ],
    }), false);

    expect(draws.filter((draw) => draw.asset === "twinWeave").map((draw) => draw.id)).toEqual([
      "projectile:exact-effects:twinChamber.pair",
    ]);
    expect(draws.filter((draw) => draw.asset === "orbitTrail").map((draw) => draw.id)).toEqual([
      "projectile:exact-effects:haloChamber.spiral",
    ]);
  });

  test("preserves Crossfire segments and lineage, Snare lineage, and semantic area layers", () => {
    const state = withState({
      areas: [{
        id: "snare-1",
        kind: "snare",
        effectId: "ectoplasmSnare.pool",
        artifactId: "ectoplasmSnare",
        rootTriggerId: "root:snare",
        lineageId: "lineage:snare",
        instanceKey: "root",
        bornAt: 0.5,
        expiresAt: 1.5,
        tickInterval: 0.1,
        nextTickAt: 1.1,
        x: 220,
        y: 180,
        radius: 40,
        damage: 1,
        slow: 0.5,
        originPower: 10,
        generation: 0,
        reactiveEligible: true,
        reactiveEffectIds: [],
      }],
      vfxCommands: [
        {
          id: "cross",
          artifactId: "crossfireCovenant",
          effectId: "crossfireCovenant.cross",
          rootTriggerId: "root:cross",
          lineageId: "lineage:cross",
          bornAt: 0.5,
          expiresAt: 1.5,
          destination: "world",
          kind: "crossfireCovenant.cross",
          geometry: {
            type: "pair",
            pairId: "a:b",
            center: { x: 300, y: 220 },
            length: 48,
            first: { type: "segment", from: { x: 276, y: 220 }, to: { x: 324, y: 220 } },
            second: { type: "segment", from: { x: 300, y: 196 }, to: { x: 300, y: 244 } },
          },
        },
        {
          id: "ember",
          artifactId: "cinderGospel",
          effectId: "cinderGospel.emberRing",
          rootTriggerId: "root:ember",
          bornAt: 0.5,
          expiresAt: 1.5,
          destination: "world",
          kind: "cinderGospel.emberRing",
          geometry: { type: "radius", center: { x: 400, y: 200 }, radius: 64 },
        },
        {
          id: "iron",
          artifactId: "bigIron",
          effectId: "bigIron.kineticExplosion",
          rootTriggerId: "root:iron",
          bornAt: 0.5,
          expiresAt: 1.5,
          destination: "world",
          kind: "bigIron.kineticExplosion",
          geometry: { type: "radius", center: { x: 500, y: 200 }, radius: 56 },
        },
      ],
    });
    const draws = projectEffectDraws(state, false);
    const cross = draws.find((draw) => draw.id === "command:cross");

    expect(cross).toMatchObject({
      lineageId: "lineage:cross",
      bornAt: 0.5,
      expiresAt: 1.5,
      layer: "areas-trails",
      geometry: {
        type: "path",
        segments: [
          { from: { x: 276, y: 220 }, to: { x: 324, y: 220 } },
          { from: { x: 300, y: 196 }, to: { x: 300, y: 244 } },
        ],
      },
    });
    expect(draws.find((draw) => draw.id === "area:snare-1")).toMatchObject({
      lineageId: "lineage:snare",
      layer: "areas-trails",
    });
    expect(draws.find((draw) => draw.id === "command:ember")?.layer).toBe("areas-trails");
    expect(draws.find((draw) => draw.id === "command:iron")?.layer).toBe("areas-trails");
  });

  test("de-duplicates live burn markers per target rather than per root", () => {
    const burn = {
      potency: 1,
      remainingTicks: 3,
      nextTickAt: 1.2,
      rootTriggerId: "root:burn-copy",
      lineageId: "lineage:burn-copy",
      originPower: 10,
      generation: 0 as const,
      reactiveEligible: true,
      reactiveEffectIds: [],
    };
    const target = (id: string, x: number) => ({
      id,
      x,
      y: 240,
      radius: 20,
      health: 10,
      maxHealth: 10,
      kind: "dummy" as const,
      immortal: true,
      speed: 0,
      frozenUntil: 0,
      effects: { ...createTargetEffects(), burn },
    });
    const draws = projectEffectDraws(withState({
      targets: [target("source", 200), target("copied", 420)],
      vfxCommands: [{
        id: "burn-source",
        artifactId: "cinderGospel",
        effectId: "cinderGospel.burn",
        rootTriggerId: burn.rootTriggerId,
        lineageId: burn.lineageId,
        bornAt: 0.5,
        expiresAt: 1.5,
        destination: "world",
        kind: "cinderGospel.burn",
        geometry: { type: "target", targetId: "source", at: { x: 200, y: 240 } },
      }],
    }), false).filter((draw) => draw.asset === "burnMark");

    expect(draws).toHaveLength(2);
    expect(draws.map((draw) => draw.rootTriggerId)).toEqual([burn.rootTriggerId, burn.rootTriggerId]);
    expect(draws.map((draw) => draw.geometry).map((geometry) =>
      geometry.type === "sprite" ? geometry.x : null).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([200, 420]);
  });

  test("anchors target commands to the moving target, with the command snapshot as fallback", () => {
    const command: GameState["vfxCommands"][number] = {
      id: "burn-moving",
      artifactId: "cinderGospel",
      effectId: "cinderGospel.burn",
      rootTriggerId: "root:burn",
      bornAt: 0.5,
      expiresAt: 1.5,
      destination: "world",
      kind: "cinderGospel.burn",
      geometry: { type: "target", targetId: "runner", at: { x: 100, y: 120 } },
    };
    const live = withState({
      vfxCommands: [command],
      targets: [{
        id: "runner",
        x: 500,
        y: 320,
        radius: 20,
        health: 10,
        maxHealth: 10,
        kind: "chaser",
        immortal: false,
        speed: 100,
        frozenUntil: 0,
        effects: createTargetEffects(),
      }],
    });

    expect(projectEffectDraws(live, false)[0]?.geometry).toMatchObject({ x: 500, y: 320 });
    expect(projectEffectDraws({ ...live, targets: [] }, false)[0]?.geometry).toMatchObject({ x: 100, y: 120 });
  });

  test("anchors Hex pulse radius to its moving target, with the impact center as fallback", () => {
    const command: GameState["vfxCommands"][number] = {
      id: "hex-moving",
      artifactId: "hexBell",
      effectId: "hexBell.pulse",
      rootTriggerId: "root:hex",
      bornAt: 0.5,
      expiresAt: 1.5,
      destination: "world",
      kind: "hexBell.pulse",
      targetId: "runner",
      geometry: { type: "radius", center: { x: 130, y: 140 }, radius: 80 },
    };
    const live = withState({
      vfxCommands: [command],
      targets: [{
        id: "runner",
        x: 520,
        y: 340,
        radius: 20,
        health: 10,
        maxHealth: 10,
        kind: "chaser",
        immortal: false,
        speed: 100,
        frozenUntil: 0,
        effects: createTargetEffects(),
      }],
    });

    expect(projectEffectDraws(live, false)[0]?.geometry).toMatchObject({ type: "disc", x: 520, y: 340 });
    expect(projectEffectDraws({ ...live, targets: [] }, false)[0]?.geometry).toMatchObject({ x: 130, y: 140 });
  });

  test("reduced motion preserves essential geometry and freezes animatable phase", () => {
    const state = withState({
      wakeTrails: { "wake-1": {
        lineageId: "wake-1",
        artifactId: "ectoplasmicWake",
        effectId: "ectoplasmicWake.trail",
        rootTriggerId: "root:wake",
        nextTickAt: 1.1,
        tickInterval: 0.1,
        cooldown: 0.2,
        width: 18,
        duration: 1.5,
        damageScale: 0.05,
        segments: [{
          id: "segment-1",
          from: { x: 100, y: 100 },
          to: { x: 180, y: 100 },
          bornAt: 0.5,
          completeAt: 0.6,
          expiresAt: 2,
          duration: 1.5,
          width: 18,
          damage: 1,
          sourceProjectile: projectile("wake-source"),
        }],
      } },
      vfxCommands: [{
        id: "blast-1",
        artifactId: "hollowPoint",
        effectId: "hollowPoint.explosion",
        rootTriggerId: "root:blast",
        bornAt: 0.5,
        expiresAt: 1.5,
        destination: "world",
        kind: "hollowPoint.explosion",
        geometry: { type: "radius", center: { x: 300, y: 200 }, radius: 90 },
      }],
    });
    const regular = projectEffectDraws(state, false);
    const reduced = projectEffectDraws(state, true);
    const essentialIds = (draws: typeof regular) => draws
      .filter((draw) => draw.essential)
      .map((draw) => draw.id)
      .sort();

    expect(essentialIds(reduced)).toEqual(essentialIds(regular));
    expect(reduced.map((draw) => draw.geometry)).toEqual(regular.map((draw) => draw.geometry));
    expect(reduced.filter((draw) => draw.animatable).every((draw) => draw.phase === 0)).toBe(true);
    expect(reduced.find((draw) => draw.id === "wake:wake-1")?.trailPersistence).toBeLessThanOrEqual(
      regular.find((draw) => draw.id === "wake:wake-1")?.trailPersistence ?? 0,
    );
  });
});
