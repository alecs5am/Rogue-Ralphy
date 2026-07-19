export type SpiralBehavior = Readonly<{ initialRadius: number; radialSpeed: number; angularSpeed: number; lifetime: number }>;
export type HomingBehavior = Readonly<{ radius: number; turnRate: number }>;
export type TeslaBehavior = Readonly<{ radius: number; neighbors: number; damageScale: number; cooldown: number }>;
export type SplitBehavior = Readonly<{ distance: number; count: number; childRange: number; damageScale: number }>;
export type PenetrationBehavior = Readonly<{ obstacles: boolean; targets: boolean }>;

export type ProjectileBehaviors = Readonly<{
  spiral?: SpiralBehavior;
  homing?: HomingBehavior;
  tesla?: TeslaBehavior;
  split?: SplitBehavior;
  penetration?: PenetrationBehavior;
}>;

export type ProjectileSpec = {
  triggerId: string; heading: number; damage: number; speed: number; radius: number; lifetime: number;
  freezeChance: number; freezeDuration: number; bounces: number; bounceRetention: number;
  orbitDuration: number; orbitAngle: number; orbitRadius: number;
  homingTurnRate: number; homingRadius: number; behaviors: ProjectileBehaviors;
};

export type ProjectileState = {
  x: number; y: number; id: string; triggerId: string; vx: number; vy: number; phase: "orbit" | "flight";
  orbitElapsed: number; orbitDuration: number; orbitAngle: number; orbitRadius: number;
  damage: number; speed: number; radius: number; lifetime: number; bornAt: number;
  remainingBounces: number; bounceRetention: number;
  freezeChance: number; freezeDuration: number;
  homingTurnRate: number; homingRadius: number; behaviors: ProjectileBehaviors; penetration?: PenetrationBehavior; hitTargetIds: string[]; everHit: boolean;
};
