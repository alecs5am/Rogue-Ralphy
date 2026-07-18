export type ArtifactId = "twinChamber" | "bigIron" | "hollowPoint" | "coldcaster" | "pinball" | "deadeye" | "haloChamber" | "ghostSight";
export type ArtifactStacks = Partial<Record<ArtifactId, number>>;

export const BASE_WEAPON = { capacity: 6, damage: 20, fireRate: 3, speed: 620, radius: 5, reloadDuration: 1.5, lifetime: 8 } as const;

export type DerivedWeapon = {
  capacity: number; damage: number; fireRate: number; speed: number; radius: number;
  reloadDuration: number; lifetime: number; projectileCount: number; spread: number;
  freezeChance: number; freezeDuration: number; bounces: number; bounceRetention: number;
  activeWindow: number; activeBuff: number; activeBuffDuration: number;
  orbitDuration: number; orbitRadius: number; orbitExtraCopies: number;
  homingTurnRate: number; homingRadius: number;
};

export type ProjectileSpec = {
  heading: number; damage: number; speed: number; radius: number; lifetime: number;
  freezeChance: number; freezeDuration: number; bounces: number; bounceRetention: number;
  orbitDuration: number; orbitAngle: number; orbitRadius: number;
  homingTurnRate: number; homingRadius: number;
};

export type ShotSpec = { roundsConsumed: 1; projectiles: ProjectileSpec[] };

const artifactIds: ArtifactId[] = ["twinChamber", "bigIron", "hollowPoint", "coldcaster", "pinball", "deadeye", "haloChamber", "ghostSight"];
const degrees = Math.PI / 180;

export function deriveWeapon(stacks: ArtifactStacks, fireRateBuff: number): DerivedWeapon {
  for (const id of artifactIds) {
    const count = stacks[id];
    if (count !== undefined && (!Number.isFinite(count) || !Number.isInteger(count) || count < 0)) {
      throw new Error(`${id} must be a finite non-negative integer`);
    }
  }
  if (!Number.isFinite(fireRateBuff)) throw new Error("fireRateBuff must be finite");

  const twinChamber = stacks.twinChamber ?? 0;
  const bigIron = stacks.bigIron ?? 0;
  const hollowPoint = stacks.hollowPoint ?? 0;
  const coldcaster = stacks.coldcaster ?? 0;
  const pinball = stacks.pinball ?? 0;
  const deadeye = stacks.deadeye ?? 0;
  const haloChamber = stacks.haloChamber ?? 0;
  const ghostSight = stacks.ghostSight ?? 0;

  return {
    ...BASE_WEAPON,
    fireRate: BASE_WEAPON.fireRate * (1 + fireRateBuff),
    radius: BASE_WEAPON.radius * (1 + 0.25 * bigIron),
    damage: BASE_WEAPON.damage * (1 + 0.35 * hollowPoint),
    projectileCount: 1 + twinChamber,
    spread: Math.min(110, 8 * twinChamber) * degrees,
    freezeChance: Math.min(1, 0.25 * coldcaster),
    freezeDuration: coldcaster ? 0.8 + 0.25 * coldcaster : 0,
    bounces: pinball,
    bounceRetention: 0.9,
    activeWindow: deadeye ? Math.min(0.45, 0.12 + 0.03 * (deadeye - 1)) : 0,
    activeBuff: 0.2 * deadeye,
    activeBuffDuration: deadeye ? 2 + 0.25 * deadeye : 0,
    orbitDuration: haloChamber ? 0.9 : 0,
    orbitRadius: haloChamber ? 30 + 10 * (haloChamber - 1) : 0,
    orbitExtraCopies: Math.max(0, haloChamber - 1),
    homingTurnRate: Math.PI * ghostSight,
    homingRadius: 40 * ghostSight,
  };
}

export function buildShot(weapon: DerivedWeapon, aimAngle: number): ShotSpec {
  const count = weapon.projectileCount + weapon.orbitExtraCopies;
  const projectiles = Array.from({ length: count }, (_, index) => {
    const orbiting = weapon.orbitDuration > 0;
    const heading = orbiting || weapon.projectileCount === 1
      ? aimAngle
      : aimAngle - weapon.spread / 2 + weapon.spread * index / (weapon.projectileCount - 1);
    return {
      heading,
      damage: weapon.damage,
      speed: weapon.speed,
      radius: weapon.radius,
      lifetime: weapon.lifetime,
      freezeChance: weapon.freezeChance,
      freezeDuration: weapon.freezeDuration,
      bounces: weapon.bounces,
      bounceRetention: weapon.bounceRetention,
      orbitDuration: weapon.orbitDuration,
      orbitAngle: orbiting ? Math.PI * 2 * index / count : 0,
      orbitRadius: weapon.orbitRadius,
      homingTurnRate: weapon.homingTurnRate,
      homingRadius: weapon.homingRadius,
    };
  });
  return { roundsConsumed: 1, projectiles };
}
