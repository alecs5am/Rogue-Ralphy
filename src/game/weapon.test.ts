import { describe, expect, test } from "bun:test";
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

describe("deriveWeapon", () => {
  test("starts with a six-round unmodified revolver", () => {
    const weapon = deriveWeapon(none, 0);
    expect(weapon).toMatchObject({
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
    expect(deriveWeapon(all, 0)).toMatchObject({
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
    expect(() => deriveWeapon({ twinChamber: 2 } as unknown as ArtifactLoadout, 0))
      .toThrow("twinChamber must be true when present");
  });

  test("rejects finite inputs when a derived value would be non-finite", () => {
    expect(() => deriveWeapon(none, Number.MAX_VALUE)).toThrow("derived fireRate must be finite");
  });

  test("keeps the fire-rate buff separate from artifact ownership", () => {
    const weapon = deriveWeapon(all, 0.25);
    expect(weapon.bounceRetention).toBe(0.9);
    expect(weapon.fireRate).toBeCloseTo(3.75);
  });
});

describe("artifact formulas", () => {
  test("Twin Chamber adds a fixed second projectile", () => {
    expect(deriveWeapon({ twinChamber: true }, 0)).toMatchObject({ projectileCount: 2, spread: 8 * Math.PI / 180 });
  });

  test("Big Iron sets projectile radius", () => {
    expect(deriveWeapon({ bigIron: true }, 0).radius).toBeCloseTo(6.25);
  });

  test("Hollow Point sets damage", () => {
    expect(deriveWeapon({ hollowPoint: true }, 0).damage).toBeCloseTo(27);
  });

  test("Coldcaster applies its fixed freeze effect", () => {
    expect(deriveWeapon({ coldcaster: true }, 0)).toMatchObject({ freezeChance: 0.25, freezeDuration: 1.05 });
  });

  test("Pinball grants one retained-damage bounce", () => {
    expect(deriveWeapon({ pinball: true }, 0)).toMatchObject({ bounces: 1, bounceRetention: 0.9 });
  });

  test("Deadeye applies its fixed active reload effect", () => {
    expect(deriveWeapon({ deadeye: true }, 0)).toMatchObject({ activeWindow: 0.12, activeBuff: 0.2, activeBuffDuration: 2.25 });
  });

  test("Halo Chamber applies a fixed spiral", () => {
    expect(deriveWeapon({ haloChamber: true }, 0).behaviors.spiral).toMatchObject({ initialRadius: 24, radialSpeed: 48, angularSpeed: 3 * Math.PI, lifetime: 4 });
  });

  test("Ghost Sight applies fixed homing", () => {
    expect(deriveWeapon({ ghostSight: true }, 0).behaviors.homing).toMatchObject({ radius: 96, turnRate: 3 * Math.PI });
  });
});

describe("buildShot", () => {
  test("consumes one round while building a spread", () => {
    const shot = buildShot(deriveWeapon({ twinChamber: true }, 0), 0, () => 0, "trigger-test");
    expect(shot.roundsConsumed).toBe(1);
    expect(shot.projectiles).toHaveLength(2);
    expect(shot.projectiles[0]!.heading).toBeLessThan(shot.projectiles[1]!.heading);
  });

  test("spaces Halo multishot phases evenly around a full revolution", () => {
    const shot = buildShot(deriveWeapon({ twinChamber: true, haloChamber: true, teslaBullets: true }, 0), 0, () => 0, "trigger-test");
    expect(shot.projectiles).toHaveLength(3);
    expect(shot.projectiles.every((projectile) => projectile.behaviors.spiral !== undefined)).toBe(true);
    expect(shot.projectiles.map((projectile) => projectile.heading)).toEqual([0, Math.PI * 2 / 3, Math.PI * 4 / 3]);
  });
});
