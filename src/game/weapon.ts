import type { ArtifactId, ArtifactLoadout } from "./artifacts";
import type { CombatBuild } from "./combat-build";
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

export function deriveWeapon(build: CombatBuild, fireRateBuff: number): DerivedWeapon {
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

  for (const rule of build.triggers) {
    switch (rule.kind) {
      case "twin":
        multishot += 1;
        spread += 8 * Math.PI / 180;
        break;
      case "activeReload":
        activeWindow = rule.window;
        activeBuff = rule.buff;
        activeBuffDuration = rule.duration;
        break;
      case "fractionalMultishot":
        multishot += rule.chance;
        spread += rule.spread;
        break;
      case "heavyMainAndMoonlet":
        radius *= rule.radiusScale;
        break;
      default:
        break;
    }
  }
  for (const rule of build.motions) {
    if (rule.kind === "spiral") {
      const { initialRadius, radialSpeed, angularSpeed, lifetime } = rule;
      behaviors = { ...behaviors, spiral: { initialRadius, radialSpeed, angularSpeed, lifetime } };
    } else if (rule.kind === "homing") {
      const { radius: acquireRadius, turnRate } = rule;
      behaviors = { ...behaviors, homing: { radius: acquireRadius, turnRate } };
    }
  }
  for (const rule of build.impacts) {
    switch (rule.kind) {
      case "bounce":
        bounces += rule.count;
        bounceRetention = rule.retention;
        break;
      case "penetration":
        behaviors = { ...behaviors, penetration: { obstacles: rule.obstacles, targets: rule.targets } };
        break;
      case "embeddedCharge":
        if (rule.artifactId === "hollowPoint") damage *= 1.35;
        break;
      case "chill":
        if (rule.artifactId === "coldcaster") {
          freezeChance = 0.25;
          freezeDuration = rule.freezeDuration;
        }
        break;
      default:
        break;
    }
  }
  for (const rule of build.emissions) {
    if (rule.kind !== "splitCone") continue;
    behaviors = { ...behaviors, split: {
      distance: rule.distance,
      count: rule.count,
      childRange: rule.range,
      damageScale: rule.damageScale,
      fanAngle: rule.angle,
      radiusScale: rule.radiusScale,
    } };
  }
  for (const rule of build.areas) {
    if (rule.kind !== "projectileLink") continue;
    behaviors = { ...behaviors, tesla: {
      radius: rule.radius,
      neighbors: rule.neighbors,
      damageScale: rule.damageScale,
      cooldown: rule.cooldown,
    } };
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
