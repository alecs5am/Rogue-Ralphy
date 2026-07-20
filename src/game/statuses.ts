import type { CombatBuild, EmissionRule } from "./combat-build";
import type { DamageEvent } from "./metrics";
import type { ProjectileState } from "./projectiles";
import type { Point } from "./room";

export type HollowPointCharge = Readonly<{
  damage: number;
  expiresAt: number;
  rootTriggerId: string;
  lineageId?: string;
  projectileId?: string;
  originPower: number;
  generation: 0 | 1;
  reactiveEffectIds: readonly string[];
  sourceProjectile: ProjectileState;
}>;

export type StatusProvenance = Readonly<{
  rootTriggerId: string;
  lineageId?: string;
  projectileId?: string;
  originPower: number;
  generation: 0 | 1;
  reactiveEligible: boolean;
  reactiveEffectIds: readonly string[];
  sourceProjectile?: ProjectileState;
}>;

export type BurnStatus = StatusProvenance & Readonly<{
  potency: number;
  remainingTicks: number;
  nextTickAt: number;
}>;

export type TargetEffects = Readonly<{
  chill: Readonly<{ count: 0 | 1 | 2; expiresAt: number }>;
  burn?: BurnStatus;
  hollowPoint?: HollowPointCharge;
  ledger: Readonly<{ count: number; expiresAt: number }>;
  slows: readonly Readonly<{ effectId: string; multiplier: number; until: number }>[];
}>;

export type WantedBrand = Readonly<{ targetId: string; expiresAt: number }>;
export type RootStatusRecord = Readonly<{ rootTriggerId: string }>;

export type StatusTarget = Readonly<Point & {
  id: string;
  kind: "dummy" | "chaser";
  radius: number;
  health: number;
  maxHealth: number;
  immortal: boolean;
  speed: number;
  frozenUntil: number;
  effects: TargetEffects;
}>;

export type StatusRuntime = Readonly<{
  targets: readonly StatusTarget[];
  wantedBrand?: WantedBrand;
  hexCounter: number;
  snareRoots: Readonly<Record<string, RootStatusRecord>>;
}>;

export type SnareAreaState = Readonly<{
  id: string;
  kind: "snare";
  effectId: "ectoplasmSnare.pool";
  artifactId: "ectoplasmSnare";
  rootTriggerId: string;
  instanceKey: "root";
  bornAt: number;
  expiresAt: number;
  tickInterval: number;
  nextTickAt: number;
  x: number;
  y: number;
  radius: number;
  damage: number;
  slow: number;
}> & StatusProvenance;

export type StatusDamageRequest = Readonly<{
  event: DamageEvent;
  sourceProjectile?: ProjectileState;
  burn?: BurnStatus;
}>;

export type StatusVfxRequest = Readonly<{
  id: string;
  kind: string;
  artifactId: string;
  bornAt: number;
  expiresAt: number;
  x: number;
  y: number;
  targetId?: string;
}>;

export type DirectStatusResult = StatusRuntime & Readonly<{
  areas: readonly Omit<SnareAreaState, "id">[];
  damages: readonly StatusDamageRequest[];
  vfx: readonly StatusVfxRequest[];
  shatter?: Readonly<{
    rule: Extract<EmissionRule, { kind: "shatter" }>;
    headings: readonly [0, number, number, number];
  }>;
}>;

const EMPTY_CHILL = Object.freeze({ count: 0, expiresAt: 0 } as const);
const EMPTY_LEDGER = Object.freeze({ count: 0, expiresAt: 0 } as const);
const EPSILON = 1e-10;
const compareTimes = (a: number, b: number): number => {
  const difference = a - b;
  const tolerance = Number.EPSILON * 128 * Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(difference) <= tolerance ? 0 : difference;
};

export function createTargetEffects(): TargetEffects {
  return { chill: EMPTY_CHILL, ledger: EMPTY_LEDGER, slows: [] };
}

export function normalizeTargetEffects(effects: Partial<TargetEffects> | undefined, now = -Infinity): TargetEffects {
  const chill = effects?.chill && now < effects.chill.expiresAt ? effects.chill : EMPTY_CHILL;
  const ledger = effects?.ledger && now < effects.ledger.expiresAt ? effects.ledger : EMPTY_LEDGER;
  return {
    chill: { ...chill },
    ...(effects?.burn && effects.burn.remainingTicks > 0 ? { burn: { ...effects.burn } } : {}),
    ...(effects?.hollowPoint && now < effects.hollowPoint.expiresAt ? { hollowPoint: effects.hollowPoint } : {}),
    ledger: { ...ledger },
    slows: (effects?.slows ?? []).filter(({ until }) => now < until).map((slow) => ({ ...slow })),
  };
}

const cloneTarget = (target: StatusTarget, now = -Infinity): StatusTarget => ({
  ...target,
  frozenUntil: now < target.frozenUntil ? target.frozenUntil : 0,
  effects: normalizeTargetEffects(target.effects, now),
});

const active = (target: StatusTarget): boolean => target.immortal || target.health > 0;
const rootKey = (effectId: string, rootTriggerId: string): string => `${effectId}\0${rootTriggerId}`;

function provenance(projectile: ProjectileState): StatusProvenance {
  return {
    rootTriggerId: projectile.rootTriggerId,
    lineageId: projectile.lineageId,
    projectileId: projectile.id,
    originPower: projectile.damage,
    generation: projectile.generation,
    reactiveEligible: projectile.generation === 0,
    reactiveEffectIds: [...projectile.activatedEffectIds],
    sourceProjectile: projectile,
  };
}

function mergeBurn(
  existing: BurnStatus | undefined,
  incoming: BurnStatus,
  remainingTicks: number,
): BurnStatus {
  if (!existing) return { ...incoming, remainingTicks };
  const owner = incoming.potency > existing.potency ? incoming : existing;
  return {
    ...owner,
    potency: Math.max(existing.potency, incoming.potency),
    remainingTicks,
    nextTickAt: Math.min(existing.nextTickAt, incoming.nextTickAt),
  };
}

function upsertSlow(
  slows: TargetEffects["slows"],
  effectId: string,
  multiplier: number,
  until: number,
): TargetEffects["slows"] {
  return [...slows.filter((slow) => slow.effectId !== effectId), { effectId, multiplier, until }];
}

function statusVfx(
  kind: string,
  artifactId: string,
  target: StatusTarget,
  bornAt: number,
  expiresAt: number,
): StatusVfxRequest {
  return {
    id: `status:${kind}:${target.id}`,
    kind,
    artifactId,
    bornAt,
    expiresAt,
    x: target.x,
    y: target.y,
    targetId: target.id,
  };
}

export function applyDirectStatuses(input: Readonly<{
  runtime: StatusRuntime;
  targetId: string;
  targetWasAlive: boolean;
  projectile: ProjectileState;
  build: CombatBuild;
  now: number;
  impactPoint: Point;
  player: Point;
}>): DirectStatusResult {
  if (!Number.isFinite(input.now)) throw new Error("status time must be finite");
  const targets = input.runtime.targets.map((target) => cloneTarget(target, input.now));
  const targetIndex = targets.findIndex(({ id }) => id === input.targetId);
  if (targetIndex < 0) throw new Error(`unknown status target: ${input.targetId}`);
  let target = targets[targetIndex]!;
  let wantedBrand = input.runtime.wantedBrand && input.now < input.runtime.wantedBrand.expiresAt
    ? { ...input.runtime.wantedBrand }
    : undefined;
  let hexCounter = input.runtime.hexCounter;
  const snareRoots = { ...input.runtime.snareRoots };
  const areas: Omit<SnareAreaState, "id">[] = [];
  const damages: StatusDamageRequest[] = [];
  const vfx: StatusVfxRequest[] = [];
  let shatter: DirectStatusResult["shatter"];
  const source = provenance(input.projectile);

  const replaceTarget = (next: StatusTarget): void => {
    target = next;
    targets[targetIndex] = next;
  };

  for (const rule of input.build.impacts) {
    if (!input.projectile.activatedEffectIds.includes(rule.effectId)) continue;
    switch (rule.kind) {
      case "chill": {
        const wasFrozen = input.now < target.frozenUntil;
        if (wasFrozen && input.projectile.generation === 0) {
          const shatterRule = input.build.emissions.find((candidate): candidate is Extract<EmissionRule, { kind: "shatter" }> =>
            candidate.kind === "shatter" && input.projectile.activatedEffectIds.includes(candidate.effectId));
          if (shatterRule) shatter = { rule: shatterRule, headings: [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2] };
          replaceTarget({ ...target, frozenUntil: 0 });
        }
        const count = target.effects.chill.count + 1;
        if (count >= rule.stacks) {
          replaceTarget({
            ...target,
            frozenUntil: Math.max(target.frozenUntil, input.now + rule.freezeDuration),
            effects: { ...target.effects, chill: EMPTY_CHILL },
          });
          vfx.push(statusVfx("coldcaster.freeze", rule.artifactId, target, input.now, input.now + rule.freezeDuration));
        } else {
          replaceTarget({
            ...target,
            effects: { ...target.effects, chill: { count: count as 1 | 2, expiresAt: input.now + rule.stackDuration } },
          });
          vfx.push(statusVfx("coldcaster.chill", rule.artifactId, target, input.now, input.now + rule.stackDuration));
        }
        break;
      }
      case "burn": {
        const burn = mergeBurn(target.effects.burn, {
          ...source,
          potency: input.projectile.damage * rule.damageScale,
          remainingTicks: rule.ticks,
          nextTickAt: input.now + rule.interval,
        }, rule.ticks);
        replaceTarget({ ...target, effects: { ...target.effects, burn } });
        vfx.push(statusVfx(
          "cinderGospel.burn",
          rule.artifactId,
          target,
          input.now,
          Math.max(input.now + 0.01, burn.nextTickAt + (burn.remainingTicks - 1) * rule.interval),
        ));
        break;
      }
      case "brand":
        if (!wantedBrand && input.targetWasAlive) {
          wantedBrand = { targetId: target.id, expiresAt: input.now + rule.duration };
          vfx.push(statusVfx("wantedBrand.mark", rule.artifactId, target, input.now, wantedBrand.expiresAt));
        }
        break;
      case "hitCounter": {
        const count = target.effects.ledger.count + 1;
        if (count >= rule.hits) {
          replaceTarget({ ...target, effects: { ...target.effects, ledger: EMPTY_LEDGER } });
          if (active(target)) {
            const event: DamageEvent = {
              source: "area",
              damage: input.projectile.damage * rule.damageScale,
              time: input.now,
              targetId: target.id,
              artifactId: rule.artifactId,
              effectId: "widowsLedger.line",
              rootTriggerId: source.rootTriggerId,
              lineageId: source.lineageId,
              projectileId: source.projectileId,
              killReactionDepth: 0,
              originPower: input.projectile.damage,
              generation: source.generation,
              reactiveEffectIds: source.reactiveEffectIds,
              x: target.x,
              y: target.y,
            };
            damages.push({ event, sourceProjectile: source.sourceProjectile, burn: target.effects.burn });
            vfx.push({
              id: `vfx:widowsLedger.line:${source.projectileId}:${target.id}:${input.now}`,
              kind: "widowsLedger.line",
              artifactId: rule.artifactId,
              bornAt: input.now,
              expiresAt: input.now + 0.2,
              x: input.player.x,
              y: input.player.y,
              targetId: target.id,
            });
          }
        } else {
          replaceTarget({
            ...target,
            effects: { ...target.effects, ledger: { count, expiresAt: input.now + rule.duration } },
          });
          vfx.push(statusVfx("widowsLedger.notch", rule.artifactId, target, input.now, input.now + rule.duration));
        }
        break;
      }
      case "poolOnHit": {
        const key = rootKey(rule.effectId, source.rootTriggerId);
        if (!snareRoots[key]) {
          snareRoots[key] = { rootTriggerId: source.rootTriggerId };
          areas.push({
            kind: "snare",
            effectId: "ectoplasmSnare.pool",
            artifactId: "ectoplasmSnare",
            instanceKey: "root",
            bornAt: input.now,
            expiresAt: input.now + rule.duration,
            tickInterval: 1 / rule.tickRate,
            nextTickAt: input.now + 1 / rule.tickRate,
            x: input.impactPoint.x,
            y: input.impactPoint.y,
            radius: rule.radius,
            damage: input.projectile.damage * rule.damageScale,
            slow: rule.slow,
            ...source,
          });
          vfx.push({
            id: `status:ectoplasmSnare.pool:${source.rootTriggerId}`,
            kind: "ectoplasmSnare.pool",
            artifactId: rule.artifactId,
            bornAt: input.now,
            expiresAt: input.now + rule.duration,
            x: input.impactPoint.x,
            y: input.impactPoint.y,
          });
        }
        break;
      }
      case "statusPulse": {
        hexCounter += 1;
        if (hexCounter < rule.cadence) break;
        hexCounter = 0;
        const sourceEffects = target.effects;
        for (let index = 0; index < targets.length; index += 1) {
          let destination = targets[index]!;
          if (!active(destination) || Math.hypot(destination.x - target.x, destination.y - target.y) > rule.radius) continue;
          let effects = destination.effects;
          if (destination.kind === "chaser") {
            effects = { ...effects, slows: upsertSlow(effects.slows, rule.effectId, rule.slow, input.now + rule.duration) };
          }
          if (destination.id !== target.id) {
            if (sourceEffects.chill.count > 0 && input.now < sourceEffects.chill.expiresAt) {
              effects = {
                ...effects,
                chill: {
                  count: Math.max(effects.chill.count, sourceEffects.chill.count) as 1 | 2,
                  expiresAt: Math.max(effects.chill.expiresAt, sourceEffects.chill.expiresAt),
                },
              };
            }
            if (sourceEffects.burn) {
              const copied: BurnStatus = { ...sourceEffects.burn, nextTickAt: input.now + 0.4 };
              effects = {
                ...effects,
                burn: mergeBurn(effects.burn, copied, Math.max(effects.burn?.remainingTicks ?? 0, copied.remainingTicks)),
              };
            }
          }
          destination = { ...destination, effects };
          targets[index] = destination;
          if (destination.id === target.id) target = destination;
        }
        vfx.push({
          id: `vfx:hexBell.pulse:${source.projectileId}:${target.id}:${input.now}`,
          kind: "hexBell.pulse",
          artifactId: rule.artifactId,
          bornAt: input.now,
          expiresAt: input.now + 0.25,
          x: target.x,
          y: target.y,
          targetId: target.id,
        });
        break;
      }
      default:
        break;
    }
  }

  return { targets, wantedBrand, hexCounter, snareRoots, areas, damages, vfx, shatter };
}

export function effectiveSlow(
  slows: readonly Readonly<{ multiplier: number; until: number }>[],
  now: number,
  transient = 1,
): number {
  return Math.min(transient, ...slows.filter(({ until }) => now < until).map(({ multiplier }) => multiplier));
}

export function snareSlowAt(target: Point, areas: readonly SnareAreaState[], now: number): number {
  return Math.min(1, ...areas
    .filter((area) => now < area.expiresAt && Math.hypot(target.x - area.x, target.y - area.y) <= area.radius)
    .map(({ slow }) => slow));
}

export function selectBrandTarget(origin: Point, targets: readonly StatusTarget[], radius: number): string | undefined {
  return targets
    .filter((target) => active(target) && (target.x - origin.x) ** 2 + (target.y - origin.y) ** 2 <= radius ** 2)
    .sort((a, b) => (a.x - origin.x) ** 2 + (a.y - origin.y) ** 2
      - ((b.x - origin.x) ** 2 + (b.y - origin.y) ** 2) || a.id.localeCompare(b.id))[0]?.id;
}

export function jumpWantedBrand(
  brand: WantedBrand | undefined,
  killed: Readonly<{ id: string; x: number; y: number }>,
  targets: readonly StatusTarget[],
  now: number,
  radius: number,
): WantedBrand | undefined {
  if (!brand || !(now < brand.expiresAt) || brand.targetId !== killed.id) return brand && now < brand.expiresAt ? brand : undefined;
  const targetId = selectBrandTarget(killed, targets.filter(({ id }) => id !== killed.id), radius);
  return targetId ? { targetId, expiresAt: brand.expiresAt } : undefined;
}

export function advanceStatuses(input: Readonly<{
  targets: readonly StatusTarget[];
  areas: readonly SnareAreaState[];
  now: number;
}>): Readonly<{
  targets: readonly StatusTarget[];
  areas: readonly SnareAreaState[];
  damages: readonly StatusDamageRequest[];
}> {
  const targets = input.targets.map((target) => cloneTarget(target, input.now));
  const damages: StatusDamageRequest[] = [];

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]!;
    const burn = input.targets[index]!.effects.burn;
    if (!burn) continue;
    let remainingTicks = burn.remainingTicks;
    let nextTickAt = burn.nextTickAt;
    while (remainingTicks > 0 && nextTickAt <= input.now + EPSILON) {
      const event: DamageEvent = {
        source: "status",
        damage: burn.potency,
        time: nextTickAt,
        targetId: target.id,
        artifactId: "cinderGospel",
        effectId: "cinderGospel.burn",
        rootTriggerId: burn.rootTriggerId,
        lineageId: burn.lineageId,
        projectileId: burn.projectileId,
        killReactionDepth: 0,
        originPower: burn.originPower,
        generation: burn.generation,
        reactiveEffectIds: burn.reactiveEffectIds,
        x: target.x,
        y: target.y,
      };
      damages.push({ event, sourceProjectile: burn.sourceProjectile, burn });
      remainingTicks -= 1;
      nextTickAt += 0.4;
    }
    targets[index] = {
      ...target,
      effects: {
        ...target.effects,
        ...(remainingTicks > 0 ? { burn: { ...burn, remainingTicks, nextTickAt } } : { burn: undefined }),
      },
    };
  }

  const areas = input.areas.map((area) => {
    let nextTickAt = area.nextTickAt;
    while (nextTickAt <= input.now + EPSILON && nextTickAt <= area.expiresAt + EPSILON) {
      for (const target of targets) {
        if (!active(target) || Math.hypot(target.x - area.x, target.y - area.y) > area.radius) continue;
        const originalBurn = input.targets.find(({ id }) => id === target.id)?.effects.burn;
        const burnEndsAt = originalBurn
          ? originalBurn.nextTickAt + (originalBurn.remainingTicks - 1) * 0.4
          : -Infinity;
        const event: DamageEvent = {
          source: "area",
          damage: area.damage,
          time: nextTickAt,
          targetId: target.id,
          artifactId: area.artifactId,
          effectId: area.effectId,
          rootTriggerId: area.rootTriggerId,
          lineageId: area.lineageId,
          projectileId: area.projectileId,
          killReactionDepth: 0,
          originPower: area.originPower,
          generation: area.generation,
          reactiveEffectIds: area.reactiveEffectIds,
          x: target.x,
          y: target.y,
        };
        damages.push({
          event,
          sourceProjectile: area.sourceProjectile,
          burn: originalBurn && nextTickAt < burnEndsAt - EPSILON ? originalBurn : undefined,
        });
      }
      nextTickAt += area.tickInterval;
    }
    return { ...area, nextTickAt };
  }).filter(({ expiresAt }) => input.now < expiresAt);

  damages.sort((a, b) => compareTimes(a.event.time, b.event.time)
    || a.event.effectId.localeCompare(b.event.effectId)
    || a.event.rootTriggerId.localeCompare(b.event.rootTriggerId)
    || a.event.targetId.localeCompare(b.event.targetId));
  return { targets, areas, damages };
}

export function statusRootIds(targets: readonly StatusTarget[]): string[] {
  return targets.flatMap(({ effects }) => [
    ...(effects.hollowPoint ? [effects.hollowPoint.rootTriggerId] : []),
    ...(effects.burn ? [effects.burn.rootTriggerId] : []),
  ]);
}
