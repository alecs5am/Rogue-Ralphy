import type { CombatBuild, EmissionRule } from "./combat-build";
import type { DamageSource } from "./metrics";
import type { PendingEffectToken, ProjectileSpec, ProjectileState } from "./projectiles";
import type { Point } from "./room";
import type { HollowPointCharge, TargetEffects } from "./statuses";

export type { HollowPointCharge, TargetEffects } from "./statuses";

export type PendingEmission = Readonly<{
  atStep: number;
  atTime?: number;
  effectId: string;
  artifactId: string;
  phase?: number;
  rootTriggerId: string;
  lineageId: string;
  generation: 1;
  originPower: number;
  specs: readonly ProjectileSpec[];
  activatedEffectIds?: readonly string[];
  templates?: readonly ProjectileState[];
  pendingTokens?: readonly PendingEffectToken[];
}>;

export type BuiltPendingEmission = PendingEmission & Readonly<{
  phase: number;
  activatedEffectIds: readonly string[];
  templates: readonly ProjectileState[];
}>;

export type KillContext = Readonly<{
  victimId: string;
  x: number;
  y: number;
  time: number;
  source: DamageSource;
  generation: 0 | 1;
  reactiveEffectIds: readonly string[];
  artifactId: string;
  effectId: string;
  rootTriggerId: string;
  lineageId?: string;
  projectileId?: string;
  originPower: number;
  killReactionDepth: 0 | 1;
  sourceProjectile?: ProjectileState;
  targetEffects?: TargetEffects;
}>;

export type EmittedEffectRecord = Readonly<{ rootTriggerId: string; lineageId?: string }>;

export type ImpactMoment = "direct" | "bounce" | "lifetime" | "shotgun" | "range" | "kill";

export type ImpactRuleInput = Readonly<{
  source: ProjectileState;
  build: CombatBuild;
  kind: ImpactMoment;
}>;

const EMISSION_KIND: Readonly<Record<ImpactMoment, readonly EmissionRule["kind"][]>> = {
  direct: ["forwardShards"],
  bounce: ["tangentCopy"],
  lifetime: ["expiryRadial"],
  shotgun: ["splitCone", "expiryRadial"],
  range: ["expiryRadial"],
  kill: ["killSpirits"],
};

export function resolveImpactRules({ source, build, kind }: ImpactRuleInput): Readonly<{ emissions: readonly EmissionRule[] }> {
  if (source.generation !== 0) return { emissions: [] };
  const kinds = EMISSION_KIND[kind];
  return {
    emissions: build.emissions.filter((rule) => kinds.includes(rule.kind)
      && source.activatedEffectIds.includes(rule.effectId)
      && !source.emittedEffectIds.includes(rule.effectId)),
  };
}

const expectedCount = (rule: EmissionRule): number => {
  if ("count" in rule) return rule.count;
  return 1;
};

const childRange = (rule: EmissionRule): number | undefined => "range" in rule ? rule.range : undefined;

const cloneProjectile = (projectile: ProjectileState): ProjectileState => ({
  ...projectile,
  emission: projectile.emission && { ...projectile.emission },
  activatedEffectIds: [...projectile.activatedEffectIds],
  reactiveEffectIds: [...projectile.reactiveEffectIds],
  emittedEffectIds: [...projectile.emittedEffectIds],
  pendingEffectTokens: projectile.pendingEffectTokens && [...projectile.pendingEffectTokens],
  behaviors: Object.freeze(Object.fromEntries(Object.entries(projectile.behaviors).map(([key, value]) => [
    key,
    value && typeof value === "object" ? { ...value } : value,
  ]))),
  penetration: projectile.penetration && { ...projectile.penetration },
  hitTargetIds: [...projectile.hitTargetIds],
  outboundHitTargetIds: projectile.outboundHitTargetIds && [...projectile.outboundHitTargetIds],
  returnHitTargetIds: projectile.returnHitTargetIds && [...projectile.returnHitTargetIds],
  motionRules: projectile.motionRules && [...projectile.motionRules],
  bellPulse: projectile.bellPulse && { ...projectile.bellPulse },
});

function templateFromSpec(
  source: ProjectileState,
  rule: EmissionRule,
  spec: ProjectileSpec,
  id: string,
  localOrdinal: number,
  childCount: number,
  origin: Point,
  activatedEffectIds: readonly string[],
): ProjectileState {
  const { split: _, crossfire: __, ...behaviors } = spec.behaviors;
  const spiral = behaviors.spiral;
  const velocity = { vx: Math.cos(spec.heading) * spec.speed, vy: Math.sin(spec.heading) * spec.speed };
  return cloneProjectile({
    ...source,
    ...velocity,
    id,
    triggerId: source.rootTriggerId,
    generation: 1,
    localOrdinal,
    activatedEffectIds,
    reactiveEffectIds: [],
    emittedEffectIds: [],
    emission: Object.freeze({ artifactId: rule.artifactId, effectId: rule.effectId }),
    pendingEffectTokens: undefined,
    originPower: source.originPower,
    x: origin.x,
    y: origin.y,
    damage: spec.damage,
    speed: spec.speed,
    radius: spec.radius,
    lifetime: spec.lifetime,
    remainingBounces: spec.bounces,
    bounceRetention: spec.bounceRetention,
    freezeChance: spec.freezeChance,
    freezeDuration: spec.freezeDuration,
    behaviors: Object.freeze(behaviors),
    penetration: behaviors.penetration,
    hitTargetIds: [],
    outboundHitTargetIds: [],
    returnHitTargetIds: [],
    everHit: false,
    travelled: 0,
    maxTravel: childRange(rule),
    splitParentId: source.id,
    splitOrigin: Object.freeze({ ...origin }),
    spiralOrigin: spiral ? Object.freeze({ ...origin }) : undefined,
    spiralRadius: spiral?.initialRadius,
    spiralAngle: spiral ? spec.heading : undefined,
    spiralAngularSpeed: spiral?.angularSpeed,
    spiralLaunchPending: spiral ? true : undefined,
    homingTargetId: undefined,
    homingMarkerRemaining: 0,
    relayTargetId: undefined,
    relayLost: undefined,
    wantedTargetId: undefined,
    soulTargetId: undefined,
    soulTurnRate: undefined,
    baseHeading: spec.heading,
    launchHeading: spec.heading,
    childIndex: localOrdinal,
    childCount,
    wavePhase: 2 * Math.PI * localOrdinal / childCount,
    waveDistance: 0,
    returnLeg: "outbound",
    legTravelled: 0,
    cometSpeedFactor: undefined,
    cometRadiusFactor: undefined,
    cometDamageFactor: undefined,
    convergeOffset: behaviors.converge ? 0 : undefined,
    convergeDone: false,
    bellPulse: undefined,
  });
}

export function buildGenerationOneEmission(
  source: ProjectileState,
  rule: EmissionRule,
  specs: readonly ProjectileSpec[],
  currentStep: number,
  options: Readonly<{
    childIds?: readonly string[];
    origin?: Point;
    emissionEffectIds?: readonly string[];
    templates?: readonly ProjectileState[];
    pendingTokens?: readonly PendingEffectToken[];
    soulTargetIds?: readonly (string | undefined)[];
  }> = {},
): BuiltPendingEmission {
  if (source.generation !== 0) throw new Error("generation-one projectile cannot emit");
  if (!source.activatedEffectIds.includes(rule.effectId)) throw new Error(`${rule.effectId} is not eligible`);
  if (source.emittedEffectIds.includes(rule.effectId)) throw new Error(`${rule.effectId} already emitted for lineage`);
  const count = expectedCount(rule);
  if (specs.length !== count) throw new Error(`${rule.effectId} must emit exactly ${count} children`);
  if (!Number.isInteger(currentStep) || currentStep < 0) throw new Error("current step must be a nonnegative integer");
  const ids = options.childIds ?? Array.from({ length: count }, (_, index) => `${source.id}:${rule.effectId}:${index}`);
  if (ids.length !== count || new Set(ids).size !== count) throw new Error(`${rule.effectId} child IDs must be exact and unique`);
  const creationIds = new Set(options.emissionEffectIds ?? [rule.effectId]);
  const activatedEffectIds = Object.freeze(source.activatedEffectIds.filter((effectId) => !creationIds.has(effectId)));
  const originSource = options.origin ?? source;
  const origin = Object.freeze({ x: originSource.x, y: originSource.y });
  const templates = options.templates?.map(cloneProjectile) ?? specs.map((spec, index) =>
    ({
      ...templateFromSpec(source, rule, spec, ids[index]!, index, count, origin, activatedEffectIds),
      soulTargetId: options.soulTargetIds?.[index],
      soulTurnRate: options.soulTargetIds?.[index] && rule.kind === "killSpirits" ? rule.turnRate : undefined,
    }));
  const frozenSpecs = Object.freeze(specs.map((spec) => Object.freeze({
    ...spec,
    behaviors: Object.freeze({ ...spec.behaviors }),
  })));
  const frozenTemplates = Object.freeze(templates.map((template, index) => {
    const child = cloneProjectile({
      ...template,
      id: ids[index]!,
      localOrdinal: index,
      generation: 1,
      activatedEffectIds,
      reactiveEffectIds: [],
      pendingEffectTokens: options.pendingTokens && Object.freeze(options.pendingTokens.map((token) => Object.freeze({ ...token }))),
      emittedEffectIds: [],
      emission: Object.freeze({ artifactId: rule.artifactId, effectId: rule.effectId }),
    });
    child.activatedEffectIds = Object.freeze([...child.activatedEffectIds]);
    child.emittedEffectIds = Object.freeze([]);
    child.hitTargetIds = Object.freeze([]) as unknown as string[];
    child.outboundHitTargetIds = Object.freeze([]) as unknown as string[];
    child.returnHitTargetIds = Object.freeze([]) as unknown as string[];
    return Object.freeze(child);
  }));
  return Object.freeze({
    atStep: currentStep + 1,
    effectId: rule.effectId,
    artifactId: rule.artifactId,
    phase: rule.phase,
    rootTriggerId: source.rootTriggerId,
    lineageId: source.lineageId,
    generation: 1,
    originPower: source.originPower,
    specs: frozenSpecs,
    activatedEffectIds,
    templates: frozenTemplates,
    pendingTokens: options.pendingTokens && Object.freeze(options.pendingTokens.map((token) => Object.freeze({ ...token }))),
  });
}

export function materializeEmission(pending: BuiltPendingEmission, now: number): ProjectileState[] {
  return [...pending.templates]
    .sort((a, b) => a.localOrdinal - b.localOrdinal)
    .map((template) => cloneProjectile({
      ...template,
      bornAt: now,
      travelled: 0,
      legTravelled: 0,
      returnLeg: "outbound",
      hitTargetIds: [],
      outboundHitTargetIds: [],
      returnHitTargetIds: [],
      everHit: false,
      convergeOffset: template.converge || template.behaviors.converge ? 0 : undefined,
      convergeDone: false,
      homingTargetId: undefined,
      homingMarkerRemaining: 0,
      relayTargetId: undefined,
      relayLost: undefined,
      cometSpeedFactor: undefined,
      cometRadiusFactor: undefined,
      cometDamageFactor: undefined,
      waveDistance: 0,
    }));
}

const compareString = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function sortPendingEmissions(pending: readonly PendingEmission[]): PendingEmission[] {
  return [...pending].sort((a, b) => (a.atTime ?? -Infinity) - (b.atTime ?? -Infinity)
    || a.atStep - b.atStep
    || compareString(a.rootTriggerId, b.rootTriggerId)
    || compareString(a.lineageId, b.lineageId)
    || (a.phase ?? Number.MAX_SAFE_INTEGER) - (b.phase ?? Number.MAX_SAFE_INTEGER)
    || compareString(a.effectId, b.effectId));
}
