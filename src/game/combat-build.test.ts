import { describe, expect, test } from "bun:test";
import { ARTIFACT_CATALOG, type ArtifactLoadout } from "./artifacts";
import { compileCombatBuild, validateCombatBuild, type CombatBuild } from "./combat-build";

describe("combat build compiler", () => {
  test("emits stable provenance-sorted rule lists", () => {
    const loadout = { shotgun: true, teslaBullets: true, twinChamber: true } as const;
    const build = compileCombatBuild(loadout);
    expect(Object.keys(build)).toEqual(["triggers", "motions", "impacts", "emissions", "areas", "maxDescendants"]);
    for (const rules of [build.triggers, build.motions, build.impacts, build.emissions, build.areas]) {
      const provenance = rules.map(({ phase, effectId }) => [phase, effectId]);
      const sorted = [...rules]
        .sort((a, b) => a.phase - b.phase || a.effectId.localeCompare(b.effectId))
        .map(({ phase, effectId }) => [phase, effectId]);
      expect(provenance).toEqual(sorted);
      expect(rules.every((rule) => rule.artifactId && rule.effectId)).toBe(true);
      expect(Object.isFrozen(rules)).toBe(true);
    }
    expect(Object.isFrozen(build)).toBe(true);
  });

  test("all-artifact build is permutation invariant and bounded", () => {
    const forward = Object.fromEntries(ARTIFACT_CATALOG.map(({ id }) => [id, true]));
    const reverse = Object.fromEntries([...ARTIFACT_CATALOG].reverse().map(({ id }) => [id, true]));
    expect(compileCombatBuild(reverse as ArtifactLoadout)).toEqual(compileCombatBuild(forward as ArtifactLoadout));
    expect(compileCombatBuild(forward as ArtifactLoadout).maxDescendants).toBe(294);
    expect(validateCombatBuild(compileCombatBuild(forward as ArtifactLoadout))).toEqual([]);
  });

  test("Grave Echo compiles its delayed trigger and generation-one echo payload", () => {
    const build = compileCombatBuild({ graveEcho: true });
    expect(build.triggers).toContainEqual(expect.objectContaining({
      artifactId: "graveEcho", kind: "delayedVolley", delay: 0.28, damageScale: 0.4,
    }));
    expect(build.emissions).toContainEqual(expect.objectContaining({
      artifactId: "graveEcho", kind: "echo", delay: 0.28, damageScale: 0.4,
    }));
  });

  test("rejects unstable provenance and descendant overflow", () => {
    const valid = compileCombatBuild({ twinChamber: true, teslaBullets: true });
    const invalid = {
      ...valid,
      triggers: [...valid.triggers].reverse(),
      maxDescendants: 385,
    } as CombatBuild;
    const errors = validateCombatBuild(invalid);
    expect(errors).toContain("trigger rules must be sorted by phase and effectId");
    expect(errors).toContain("combat build exceeds the 384 descendant cap");
  });

  test("rejects unsafe area rates, generation depth, and duplicate exclusive motions", () => {
    const valid = compileCombatBuild({ ectoplasmicWake: true, haloChamber: true, shotgun: true });
    const spiral = valid.motions.find(({ kind }) => kind === "spiral")!;
    const invalid = {
      ...valid,
      motions: [spiral, { ...spiral, effectId: "haloChamber.secondSpiral" }],
      emissions: valid.emissions.map((rule) => ({ ...rule, generation: 2 })),
      areas: valid.areas.map((rule) => rule.kind === "trail" ? { ...rule, duration: 4, tickRate: 11 } : rule),
    } as unknown as CombatBuild;
    const errors = validateCombatBuild(invalid);
    expect(errors).toContain("duplicate exclusive motion kind: spiral");
    expect(errors).toContain("shotgun.split exceeds generation depth one");
    expect(errors).toContain("ectoplasmicWake.trail.duration must not exceed 3 seconds");
    expect(errors).toContain("ectoplasmicWake.trail.tickRate must not exceed 10 Hz");
  });

  test("validates Snare geometry even though it is an impact rule", () => {
    const valid = compileCombatBuild({ ectoplasmSnare: true });
    const snare = valid.impacts.find(({ kind }) => kind === "poolOnHit")!;
    const invalid = {
      ...valid,
      impacts: [{ ...snare, radius: 41, duration: 3.1, tickRate: 11, slow: 0 }],
    } as CombatBuild;

    expect(validateCombatBuild(invalid)).toEqual(expect.arrayContaining([
      "ectoplasmSnare.pool.radius must equal 40",
      "ectoplasmSnare.pool.duration must equal 1.5",
      "ectoplasmSnare.pool.tickRate must equal 10",
      "ectoplasmSnare.pool.slow must be in (0, 1]",
    ]));
  });
});
