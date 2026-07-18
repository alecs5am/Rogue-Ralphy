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
    expect(() => deriveWeapon({ bigIron: -1 }, 0)).toThrow("bigIron must be a finite non-negative integer");
    expect(() => deriveWeapon({ bigIron: Number.POSITIVE_INFINITY }, 0)).toThrow();
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
});
