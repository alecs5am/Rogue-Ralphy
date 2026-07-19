export type ArtifactId = "twinChamber" | "bigIron" | "hollowPoint" | "coldcaster" | "pinball" | "deadeye" | "haloChamber" | "ghostSight";
export type ArtifactLoadout = Partial<Record<ArtifactId, true>>;

export const BASE_WEAPON = { capacity: 6, damage: 20, fireRate: 3, speed: 620, radius: 5, reloadDuration: 1.5, lifetime: 8 } as const;

export type DerivedWeapon = {
  capacity: number; damage: number; fireRate: number; speed: number; radius: number;
  reloadDuration: number; lifetime: number; projectileCount: number; spread: number;
  freezeChance: number; freezeDuration: number; bounces: number; bounceRetention: number;
  activeWindow: number; activeBuff: number; activeBuffDuration: number;
  orbitDuration: number; orbitRadius: number;
  homingTurnRate: number; homingRadius: number;
};

export type ProjectileSpec = {
  heading: number; damage: number; speed: number; radius: number; lifetime: number;
  freezeChance: number; freezeDuration: number; bounces: number; bounceRetention: number;
  orbitDuration: number; orbitAngle: number; orbitRadius: number;
  homingTurnRate: number; homingRadius: number;
};

export type ShotSpec = { roundsConsumed: 1; projectiles: ProjectileSpec[] };

const degrees = Math.PI / 180;

function owns(loadout: ArtifactLoadout, id: ArtifactId): boolean {
  const value = loadout[id];
  if (value !== undefined && value !== true) throw new Error(`${id} must be true when present`);
  return value === true;
}

export function deriveWeapon(loadout: ArtifactLoadout, fireRateBuff: number): DerivedWeapon {
  if (!Number.isFinite(fireRateBuff)) throw new Error("fireRateBuff must be finite");

  const twinChamber = owns(loadout, "twinChamber");
  const bigIron = owns(loadout, "bigIron");
  const hollowPoint = owns(loadout, "hollowPoint");
  const coldcaster = owns(loadout, "coldcaster");
  const pinball = owns(loadout, "pinball");
  const deadeye = owns(loadout, "deadeye");
  const haloChamber = owns(loadout, "haloChamber");
  const ghostSight = owns(loadout, "ghostSight");

  const weapon = {
    ...BASE_WEAPON,
    fireRate: BASE_WEAPON.fireRate * (1 + fireRateBuff),
    radius: bigIron ? 6.25 : BASE_WEAPON.radius,
    damage: hollowPoint ? 27 : BASE_WEAPON.damage,
    projectileCount: twinChamber ? 2 : 1,
    spread: twinChamber ? 8 * degrees : 0,
    freezeChance: coldcaster ? 0.25 : 0,
    freezeDuration: coldcaster ? 1.05 : 0,
    bounces: pinball ? 1 : 0,
    bounceRetention: 0.9,
    activeWindow: deadeye ? 0.12 : 0,
    activeBuff: deadeye ? 0.2 : 0,
    activeBuffDuration: deadeye ? 2.25 : 0,
    orbitDuration: haloChamber ? 0.9 : 0,
    orbitRadius: haloChamber ? 30 : 0,
    homingTurnRate: ghostSight ? Math.PI : 0,
    homingRadius: ghostSight ? 40 : 0,
  };
  for (const [name, value] of Object.entries(weapon)) {
    if (!Number.isFinite(value)) throw new Error(`derived ${name} must be finite`);
  }
  return weapon;
}

export function buildShot(weapon: DerivedWeapon, aimAngle: number): ShotSpec {
  const count = weapon.projectileCount;
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
