import { getOwnedArtifacts, type ArtifactId, type ArtifactLoadout } from "./artifacts";
import type { ProjectileBehaviors, ProjectileSpec } from "./projectiles";

export type { ArtifactId, ArtifactLoadout } from "./artifacts";
export type { ProjectileBehaviors, ProjectileSpec } from "./projectiles";

export const BASE_WEAPON = { capacity: 6, damage: 20, fireRate: 3, speed: 620, radius: 5, reloadDuration: 1.5, lifetime: 8 } as const;

export type DerivedWeapon = {
  capacity: number; damage: number; fireRate: number; speed: number; radius: number;
  reloadDuration: number; lifetime: number; multishot: number; projectileCount: number; spread: number;
  freezeChance: number; freezeDuration: number; bounces: number; bounceRetention: number;
  activeWindow: number; activeBuff: number; activeBuffDuration: number;
  behaviors: ProjectileBehaviors;
};

const immutableBehaviors = (behaviors: ProjectileBehaviors): ProjectileBehaviors => Object.freeze({
  ...(behaviors.spiral && { spiral: Object.freeze({ ...behaviors.spiral }) }),
  ...(behaviors.homing && { homing: Object.freeze({ ...behaviors.homing }) }),
  ...(behaviors.tesla && { tesla: Object.freeze({ ...behaviors.tesla }) }),
  ...(behaviors.split && { split: Object.freeze({ ...behaviors.split }) }),
  ...(behaviors.penetration && { penetration: Object.freeze({ ...behaviors.penetration }) }),
});

export function deriveWeapon(loadout: ArtifactLoadout, fireRateBuff: number): DerivedWeapon {
  if (!Number.isFinite(fireRateBuff)) throw new Error("fireRateBuff must be finite");

  let damage = BASE_WEAPON.damage;
  let radius = BASE_WEAPON.radius;
  let multishot = 1;
  let spread = 0;
  let freezeChance = 0;
  let freezeDuration = 0;
  let bounces = 0;
  let bounceRetention = 0.9;
  let activeWindow = 0;
  let activeBuff = 0;
  let activeBuffDuration = 0;
  let behaviors: ProjectileBehaviors = {};

  for (const definition of getOwnedArtifacts(loadout)) {
    for (const effect of definition.effects) {
      switch (effect.kind) {
        case "addMultishot": multishot += effect.amount; break;
        case "multiplyDamage": damage *= effect.amount; break;
        case "multiplyRadius": radius *= effect.amount; break;
        case "spread": spread += effect.radians; break;
        case "freeze": freezeChance = effect.chance; freezeDuration = effect.duration; break;
        case "bounce": bounces += effect.count; bounceRetention = effect.retention; break;
        case "activeReload": activeWindow = effect.window; activeBuff = effect.buff; activeBuffDuration = effect.duration; break;
        case "spiral": behaviors = { ...behaviors, spiral: effect }; break;
        case "homing": behaviors = { ...behaviors, homing: effect }; break;
        case "tesla": behaviors = { ...behaviors, tesla: effect }; break;
        case "split": {
          const { kind: _, ...split } = effect;
          behaviors = { ...behaviors, split };
          break;
        }
        case "penetration": behaviors = { ...behaviors, penetration: effect }; break;
        default: {
          const exhaustive: never = effect;
          throw new Error(`unknown artifact effect: ${String(exhaustive)}`);
        }
      }
    }
  }

  const weapon = {
    ...BASE_WEAPON,
    fireRate: BASE_WEAPON.fireRate * (1 + fireRateBuff),
    damage,
    radius,
    multishot,
    projectileCount: Math.floor(multishot),
    spread,
    freezeChance,
    freezeDuration,
    bounces,
    bounceRetention,
    activeWindow,
    activeBuff,
    activeBuffDuration,
    behaviors: immutableBehaviors(behaviors),
  };
  for (const [name, value] of Object.entries(weapon)) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`derived ${name} must be finite`);
  }
  return weapon;
}

export function buildShot(weapon: DerivedWeapon, aimAngle: number, rng: () => number, triggerId: string): { roundsConsumed: 1; projectiles: ProjectileSpec[] } {
  const extraChance = weapon.multishot % 1;
  const count = Math.floor(weapon.multishot) + Number(rng() < extraChance - Number.EPSILON * Math.max(1, weapon.multishot));
  const projectiles = Array.from({ length: count }, (_, index) => {
    const heading = weapon.behaviors.spiral
      ? aimAngle + Math.PI * 2 * index / count
      : count === 1
      ? aimAngle
      : aimAngle - weapon.spread / 2 + weapon.spread * index / (count - 1);
    return {
      triggerId,
      heading,
      damage: weapon.damage,
      speed: weapon.speed,
      radius: weapon.radius,
      lifetime: weapon.lifetime,
      freezeChance: weapon.freezeChance,
      freezeDuration: weapon.freezeDuration,
      bounces: weapon.bounces,
      bounceRetention: weapon.bounceRetention,
      behaviors: immutableBehaviors(weapon.behaviors),
    };
  });
  return { roundsConsumed: 1, projectiles };
}
