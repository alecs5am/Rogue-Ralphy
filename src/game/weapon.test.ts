import { describe, expect, test } from "bun:test";
import { BASE_WEAPON, buildShot, deriveWeapon, type ArtifactStacks } from "./weapon";

const none = {} as ArtifactStacks;

describe("deriveWeapon", () => {
  test("starts with a six-round unmodified revolver", () => {
    const weapon = deriveWeapon(none, 0);
    expect(weapon).toMatchObject({ capacity: 6, damage: 20, fireRate: 3, projectileCount: 1, reloadDuration: 1.5 });
  });

  test("applies every artifact in the documented order", () => {
    const weapon = deriveWeapon({ twinChamber: 2, bigIron: 2, hollowPoint: 2, coldcaster: 2, pinball: 2, deadeye: 2, haloChamber: 2, ghostSight: 2 }, 0);
    expect(weapon.projectileCount).toBe(3);
    expect(weapon.radius).toBeCloseTo(BASE_WEAPON.radius * 1.5);
    expect(weapon.damage).toBeCloseTo(BASE_WEAPON.damage * 1.7);
    expect(weapon.freezeChance).toBe(0.5);
    expect(weapon.bounces).toBe(2);
    expect(weapon.orbitExtraCopies).toBe(1);
    expect(weapon.homingTurnRate).toBeCloseTo(Math.PI * 2);
  });

  test("keeps unlimited counts meaningful while rejecting invalid counts", () => {
    expect(deriveWeapon({ twinChamber: 1000 }, 0).projectileCount).toBe(1001);
    expect(() => deriveWeapon({ bigIron: -1 }, 0)).toThrow("bigIron must be a non-negative safe integer");
    expect(() => deriveWeapon({ bigIron: Number.POSITIVE_INFINITY }, 0)).toThrow();
  });

  test("rejects unsafe stack counts before they corrupt derived values", () => {
    expect(() => deriveWeapon({ hollowPoint: 1e308 }, 0)).toThrow("hollowPoint must be a non-negative safe integer");
  });

  test("rejects finite inputs when a derived value would be non-finite", () => {
    expect(() => deriveWeapon(none, Number.MAX_VALUE)).toThrow("derived fireRate must be finite");
  });

  test("derives status, reload, orbit, homing, and temporary buff values", () => {
    const weapon = deriveWeapon({ coldcaster: 2, pinball: 1, deadeye: 2, haloChamber: 3, ghostSight: 2 }, 0.25);
    expect(weapon.freezeDuration).toBeCloseTo(1.3);
    expect(weapon.bounceRetention).toBe(0.9);
    expect(weapon.activeWindow).toBeCloseTo(0.15);
    expect(weapon.activeBuff).toBeCloseTo(0.4);
    expect(weapon.activeBuffDuration).toBeCloseTo(2.5);
    expect(weapon.orbitExtraCopies).toBe(2);
    expect(weapon.orbitRadius).toBe(50);
    expect(weapon.homingRadius).toBe(80);
    expect(weapon.fireRate).toBeCloseTo(3.75);
  });
});

describe("artifact formulas", () => {
  test("Twin Chamber grows projectile count and caps spread", () => {
    expect(deriveWeapon({ twinChamber: 1 }, 0)).toMatchObject({ projectileCount: 2, spread: 8 * Math.PI / 180 });
    expect(deriveWeapon({ twinChamber: 2 }, 0)).toMatchObject({ projectileCount: 3, spread: 16 * Math.PI / 180 });
    expect(deriveWeapon({ twinChamber: 20 }, 0).spread).toBeCloseTo(110 * Math.PI / 180);
  });

  test("Big Iron scales projectile radius", () => {
    expect(deriveWeapon({ bigIron: 1 }, 0).radius).toBeCloseTo(6.25);
    expect(deriveWeapon({ bigIron: 3 }, 0).radius).toBeCloseTo(8.75);
  });

  test("Hollow Point scales damage", () => {
    expect(deriveWeapon({ hollowPoint: 1 }, 0).damage).toBeCloseTo(27);
    expect(deriveWeapon({ hollowPoint: 3 }, 0).damage).toBeCloseTo(41);
  });

  test("Coldcaster caps chance while duration keeps growing", () => {
    expect(deriveWeapon({ coldcaster: 1 }, 0)).toMatchObject({ freezeChance: 0.25, freezeDuration: 1.05 });
    expect(deriveWeapon({ coldcaster: 2 }, 0)).toMatchObject({ freezeChance: 0.5, freezeDuration: 1.3 });
    expect(deriveWeapon({ coldcaster: 5 }, 0)).toMatchObject({ freezeChance: 1, freezeDuration: 2.05 });
  });

  test("Pinball grants one retained-damage bounce per stack", () => {
    expect(deriveWeapon({ pinball: 1 }, 0)).toMatchObject({ bounces: 1, bounceRetention: 0.9 });
    expect(deriveWeapon({ pinball: 3 }, 0)).toMatchObject({ bounces: 3, bounceRetention: 0.9 });
  });

  test("Deadeye caps its window while buff strength and duration keep growing", () => {
    expect(deriveWeapon({ deadeye: 1 }, 0)).toMatchObject({ activeWindow: 0.12, activeBuff: 0.2, activeBuffDuration: 2.25 });
    expect(deriveWeapon({ deadeye: 2 }, 0)).toMatchObject({ activeWindow: 0.15, activeBuff: 0.4, activeBuffDuration: 2.5 });
    expect(deriveWeapon({ deadeye: 20 }, 0)).toMatchObject({ activeWindow: 0.45, activeBuff: 4, activeBuffDuration: 7 });
  });

  test("Halo Chamber adds orbital copies and ring radius", () => {
    expect(deriveWeapon({ haloChamber: 1 }, 0)).toMatchObject({ orbitDuration: 0.9, orbitExtraCopies: 0, orbitRadius: 30 });
    expect(deriveWeapon({ haloChamber: 3 }, 0)).toMatchObject({ orbitDuration: 0.9, orbitExtraCopies: 2, orbitRadius: 50 });
  });

  test("Ghost Sight scales turn rate and acquisition radius", () => {
    expect(deriveWeapon({ ghostSight: 1 }, 0)).toMatchObject({ homingTurnRate: Math.PI, homingRadius: 40 });
    expect(deriveWeapon({ ghostSight: 3 }, 0)).toMatchObject({ homingTurnRate: Math.PI * 3, homingRadius: 120 });
  });
});

describe("buildShot", () => {
  test("consumes one round while building a spread", () => {
    const shot = buildShot(deriveWeapon({ twinChamber: 2 }, 0), 0);
    expect(shot.roundsConsumed).toBe(1);
    expect(shot.projectiles).toHaveLength(3);
    expect(shot.projectiles[0]!.heading).toBeLessThan(shot.projectiles[2]!.heading);
  });

  test("turns multishot into an evenly distributed orbital ring", () => {
    const shot = buildShot(deriveWeapon({ twinChamber: 2, haloChamber: 3 }, 0), 0);
    expect(shot.projectiles).toHaveLength(5);
    expect(shot.projectiles.every((projectile) => projectile.orbitDuration === 0.9)).toBe(true);
    expect(shot.projectiles.map((projectile) => projectile.orbitAngle)).toEqual([
      0,
      Math.PI * 2 / 5,
      Math.PI * 4 / 5,
      Math.PI * 6 / 5,
      Math.PI * 8 / 5,
    ]);
  });

  test("rejects infeasible projectile allocation with a deliberate error", () => {
    const weapon = deriveWeapon({ twinChamber: 2 ** 32 }, 0);
    expect(weapon.projectileCount).toBe(2 ** 32 + 1);
    expect(() => buildShot(weapon, 0)).toThrow("projectile count 4294967297 exceeds the per-shot safety budget of 10000");
  });
});
