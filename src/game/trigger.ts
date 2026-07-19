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
  spec: Readonly<Omit<ProjectileSpec, "triggerId">>;
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
  const rules = [
    ...context.build.triggers,
    ...context.build.motions,
    ...context.build.impacts,
    ...context.build.emissions,
    ...context.build.areas,
  ].sort((a, b) => a.phase - b.phase || a.effectId.localeCompare(b.effectId));
  const origin = Object.freeze({ ...context.origin });
  const specs = buildShot(context.weapon, context.aim, () => roll, context.rootTriggerId).projectiles;
  const bellIndex = context.round.ammoBefore === 1 ? 0 : -1;
  const effectApplies = (rule: (typeof rules)[number], index: number): boolean => {
    if (rule.artifactId === "lastBell") return index === bellIndex;
    if (rule.family === "area" && rule.kind === "decoyInfluence") return false;
    if (rule.family !== "trigger") return true;
    switch (rule.kind) {
      case "twin":
      case "delayedVolley":
      case "fan":
      case "heavyMainAndMoonlet":
        return true;
      case "activeReload":
        return context.round.echo;
      case "lastRound":
        return index === bellIndex;
      case "fractionalMultishot":
        return specs.length > Math.floor(context.weapon.multishot) && index === specs.length - 1;
      case "stationaryCharge":
        return context.stationaryCharged;
      case "lowHealthOrbital":
        return context.lowHealth && context.rootIndex % rule.cadence === 0
          && index === specs.findLastIndex((_, candidate) => candidate !== bellIndex);
      case "numberedSidePair":
      case "playerSatellite":
      case "recoil":
      case "ammoReturn":
      case "hurtDecoy":
        return false;
    }
  };
  const projectiles = specs.map((spec, index): ScheduledProjectile => {
    const { triggerId: _, ...projectileSpec } = spec;
    return Object.freeze({
      at: context.now,
      generation: 0,
      rootTriggerId: context.rootTriggerId,
      lineageId: `${context.rootTriggerId}:${index}`,
      effectIds: Object.freeze(["baseRevolver.direct", ...rules.filter((rule) => effectApplies(rule, index)).map(({ effectId }) => effectId)]),
      spec: Object.freeze(projectileSpec),
      origin,
      aim: context.aim,
    });
  });
  return Object.freeze({
    rootTriggerId: context.rootTriggerId,
    rootIndex: context.rootIndex,
    round: context.round,
    roundsConsumed: 1 as const,
    now: context.now,
    projectiles: Object.freeze(projectiles),
  });
}
