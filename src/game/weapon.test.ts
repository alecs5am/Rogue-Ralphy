import { describe, expect, test } from "bun:test";
import { compileCombatBuild } from "./combat-build";
import { buildShot, deriveWeapon, type ArtifactLoadout } from "./weapon";

const none = {} as ArtifactLoadout;
const all: ArtifactLoadout = {
  twinChamber: true,
  bigIron: true,
  hollowPoint: true,
  coldcaster: true,
  pinball: true,
  deadeye: true,
  haloChamber: true,
  ghostSight: true,
};
const weapon = (loadout: ArtifactLoadout, fireRateBuff = 0) =>
  deriveWeapon(compileCombatBuild(loadout), fireRateBuff);

describe("deriveWeapon", () => {
  test("starts with a six-round unmodified revolver", () => {
    const derived = weapon(none);
    expect(derived).toMatchObject({
      capacity: 6,
      damage: 20,
      fireRate: 3,
      projectileCount: 1,
      reloadDuration: 1.5,
      spread: 0,
      radius: 5,
      freezeChance: 0,
      freezeDuration: 0,
      bounces: 0,
      bounceRetention: 0.9,
      activeWindow: 0,
      activeBuff: 0,
      activeBuffDuration: 0,
      behaviors: {},
    });
  });

  test("derives the eight unique artifact effects", () => {
    expect(weapon(all)).toMatchObject({
      projectileCount: 1,
      spread: 0,
      radius: 5,
      damage: 27,
      freezeChance: 0,
      freezeDuration: 0,
      bounces: 1,
      activeWindow: 0.12,
      activeBuff: 0.2,
      activeBuffDuration: 2.25,
      behaviors: {
        spiral: { initialRadius: 24, radialSpeed: 48, angularSpeed: 3 * Math.PI, lifetime: 4 },
        homing: { radius: 96, turnRate: 3 * Math.PI },
      },
    });
  });

  test("rejects a legacy numeric artifact value", () => {
    expect(() => compileCombatBuild({ twinChamber: 2 } as unknown as ArtifactLoadout))
      .toThrow("twinChamber must be true when present");
  });

  test("rejects finite inputs when a derived value would be non-finite", () => {
    expect(() => weapon(none, Number.MAX_VALUE)).toThrow("derived fireRate must be finite");
  });

  test("keeps the fire-rate buff separate from artifact ownership", () => {
    const derived = weapon(all, 0.25);
    expect(derived.bounceRetention).toBe(0.9);
    expect(derived.fireRate).toBeCloseTo(3.75);
  });
});

describe("artifact formulas", () => {
  test("Twin Chamber remains neutral until trigger arrangement", () => {
    expect(weapon({ twinChamber: true })).toMatchObject({ projectileCount: 1, multishot: 1, spread: 0, damage: 20 });
  });

  test("Big Iron remains neutral until trigger arrangement", () => {
    expect(weapon({ bigIron: true })).toMatchObject({ radius: 5, damage: 20, speed: 620 });
  });

  test("Hollow Point sets damage", () => {
    expect(weapon({ hollowPoint: true }).damage).toBeCloseTo(27);
  });

  test("Coldcaster leaves projectile RNG neutral for deterministic status stacks", () => {
    expect(weapon({ coldcaster: true })).toMatchObject({ freezeChance: 0, freezeDuration: 0 });
  });

  test("Pinball grants one retained-damage bounce", () => {
    expect(weapon({ pinball: true })).toMatchObject({ bounces: 1, bounceRetention: 0.9 });
  });

  test("Deadeye applies its fixed active reload effect", () => {
    expect(weapon({ deadeye: true })).toMatchObject({
      activeWindow: 0.12,
      activeBuff: 0.2,
      activeBuffDuration: 2.25,
      echo: { delay: 0.12, damageScale: 0.35 },
    });
  });

  test("Halo Chamber applies a fixed spiral", () => {
    expect(weapon({ haloChamber: true }).behaviors.spiral).toMatchObject({ initialRadius: 24, radialSpeed: 48, angularSpeed: 3 * Math.PI, lifetime: 4 });
  });

  test("Ghost Sight applies fixed homing", () => {
    expect(weapon({ ghostSight: true }).behaviors.homing).toMatchObject({ radius: 96, turnRate: 3 * Math.PI });
  });

  test("Shotgun derives the approved directional split", () => {
    expect(weapon({ shotgun: true }).behaviors.split).toEqual({
      distance: 160,
      count: 8,
      childRange: 320,
      damageScale: 0.25,
      fanAngle: 48 * Math.PI / 180,
      radiusScale: 0.55,
    });
  });
});

describe("buildShot", () => {
  test("returns one neutral projectile and leaves arrangement to the trigger reducer", () => {
    let calls = 0;
    const shot = buildShot(weapon({ twinChamber: true, teslaBullets: true, bigIron: true }), 0, () => { calls += 1; return 0; }, "trigger-test");
    expect(shot.roundsConsumed).toBe(1);
    expect(calls).toBe(0);
    expect(shot.projectiles).toEqual([{
      triggerId: "trigger-test",
      heading: 0,
      damage: 20,
      speed: 620,
      radius: 5,
      lifetime: 8,
      freezeChance: 0,
      freezeDuration: 0,
      bounces: 0,
      bounceRetention: 0.9,
      behaviors: { tesla: { radius: 96, neighbors: 2, damageScale: 0.25, cooldown: 0.15 } },
    }]);
  });

  test("keeps Halo heading neutral before trigger phases are assigned", () => {
    const shot = buildShot(weapon({ twinChamber: true, haloChamber: true, teslaBullets: true }), 0, () => 0, "trigger-test");
    expect(shot.projectiles).toHaveLength(1);
    expect(shot.projectiles.every((projectile) => projectile.behaviors.spiral !== undefined)).toBe(true);
    expect(shot.projectiles.map((projectile) => projectile.heading)).toEqual([0]);
  });
});
