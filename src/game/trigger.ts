import type { CombatBuild } from "./combat-build";
import type { ConsumedRound } from "./cylinder";
import type { ProjectileSpec } from "./projectiles";
import type { Point } from "./room";
import { buildShot, type DerivedWeapon } from "./weapon";

export type TriggerContext = Readonly<{
  rootTriggerId: string;
  rootIndex: number;
  round: ConsumedRound;
  aim: number;
  origin: Point;
  now: number;
  stationaryCharged: boolean;
  lowHealth: boolean;
  build: CombatBuild;
  weapon: DerivedWeapon;
  rng: () => number;
}>;

export type ScheduledProjectile = Readonly<{
  at: number;
  generation: 0 | 1;
  rootTriggerId: string;
  lineageId: string;
  effectIds: readonly string[];
  spec: ProjectileSpec;
  origin?: Point;
  aim?: number;
}>;

export function compareScheduledProjectiles(a: ScheduledProjectile, b: ScheduledProjectile): number {
  return a.at - b.at
    || a.lineageId.localeCompare(b.lineageId)
    || a.effectIds.join("\0").localeCompare(b.effectIds.join("\0"));
}

export function expandTrigger(context: TriggerContext) {
  const roll = context.rng();
  const effectIds = Object.freeze([
    "baseRevolver.direct",
    ...[
      ...context.build.triggers,
      ...context.build.motions,
      ...context.build.impacts,
      ...context.build.emissions,
      ...context.build.areas,
    ].sort((a, b) => a.phase - b.phase || a.effectId.localeCompare(b.effectId)).map(({ effectId }) => effectId),
  ]);
  const origin = Object.freeze({ ...context.origin });
  const projectiles = buildShot(context.weapon, context.aim, () => roll, context.rootTriggerId).projectiles
    .map((spec, index): ScheduledProjectile => Object.freeze({
      at: context.now,
      generation: 0,
      rootTriggerId: context.rootTriggerId,
      lineageId: `${context.rootTriggerId}:${index}`,
      effectIds,
      spec: Object.freeze({ ...spec }),
      origin,
      aim: context.aim,
    }));
  return Object.freeze({
    rootTriggerId: context.rootTriggerId,
    rootIndex: context.rootIndex,
    round: context.round,
    roundsConsumed: 1 as const,
    now: context.now,
    projectiles: Object.freeze(projectiles),
  });
}
