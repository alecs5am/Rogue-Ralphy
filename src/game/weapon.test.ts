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
      projectileCount: 2,
      spread: 8 * Math.PI / 180,
      radius: 6.25,
      damage: 27,
      freezeChance: 0.25,
      freezeDuration: 1.05,
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
  test("Twin Chamber adds a fixed second projectile", () => {
    expect(weapon({ twinChamber: true })).toMatchObject({ projectileCount: 2, spread: 8 * Math.PI / 180 });
  });

  test("Big Iron sets projectile radius", () => {
    expect(weapon({ bigIron: true }).radius).toBeCloseTo(6.25);
  });

  test("Hollow Point sets damage", () => {
    expect(weapon({ hollowPoint: true }).damage).toBeCloseTo(27);
  });

  test("Coldcaster applies its fixed freeze effect", () => {
    expect(weapon({ coldcaster: true })).toMatchObject({ freezeChance: 0.25, freezeDuration: 1.05 });
  });

  test("Pinball grants one retained-damage bounce", () => {
    expect(weapon({ pinball: true })).toMatchObject({ bounces: 1, bounceRetention: 0.9 });
  });

  test("Deadeye applies its fixed active reload effect", () => {
    expect(weapon({ deadeye: true })).toMatchObject({ activeWindow: 0.12, activeBuff: 0.2, activeBuffDuration: 2.25 });
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
  test("consumes one round while building a spread", () => {
    const shot = buildShot(weapon({ twinChamber: true }), 0, () => 0, "trigger-test");
    expect(shot.roundsConsumed).toBe(1);
    expect(shot.projectiles).toHaveLength(2);
    expect(shot.projectiles[0]!.heading).toBeLessThan(shot.projectiles[1]!.heading);
  });

  test("spaces Halo multishot phases evenly around a full revolution", () => {
    const shot = buildShot(weapon({ twinChamber: true, haloChamber: true, teslaBullets: true }), 0, () => 0, "trigger-test");
    expect(shot.projectiles).toHaveLength(3);
    expect(shot.projectiles.every((projectile) => projectile.behaviors.spiral !== undefined)).toBe(true);
    expect(shot.projectiles.map((projectile) => projectile.heading)).toEqual([0, Math.PI * 2 / 3, Math.PI * 4 / 3]);
  });
});
