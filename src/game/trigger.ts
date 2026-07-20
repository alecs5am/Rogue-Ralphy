import type { ArtifactId } from "./artifacts";
import type { ArtifactRule, CombatBuild } from "./combat-build";
import type { ConsumedRound } from "./cylinder";
import type { EmissionProvenance, ProjectileBehaviors, ProjectileSpec } from "./projectiles";
import type { Point } from "./room";
import type { DerivedWeapon } from "./weapon";

export type LocketState = Readonly<{ armed: boolean; cadence: number }>;
export type PlayerSatelliteState = Readonly<{
  id: string;
  rootTriggerId: string;
  bornAt: number;
  expiresAt: number;
  radius: number;
  shotDamageScale: number;
  phase: number;
  x: number;
  y: number;
}>;

export type ScheduledMoonlet = Readonly<{
  parentLineageId: string;
  orbitRadius: number;
  angularSpeed: number;
  pairWindow: number;
  explosionRadius: number;
  explosionDamageScale: number;
  knockback: number;
  mainDamage: number;
  remainingRange: number;
}>;

export type TriggerContext = Readonly<{
  rootTriggerId: string;
  rootIndex: number;
  round: ConsumedRound;
  aim: number;
  aimDistance: number;
  origin: Point;
  now: number;
  stationaryCharged: boolean;
  lowHealth: boolean;
  dealerCounter: number;
  locketState: LocketState;
  build: CombatBuild;
  weapon: DerivedWeapon;
  rng: () => number;
  satellites?: readonly PlayerSatelliteState[];
}>;

export type ScheduledProjectile = Readonly<{
  at: number;
  generation: 0 | 1;
  rootTriggerId: string;
  rootIndex: number;
  localOrdinal: number;
  lineageId: string;
  effectIds: readonly string[];
  emission?: EmissionProvenance;
  spec: Readonly<Omit<ProjectileSpec, "triggerId"> & { triggerId?: never }>;
  origin?: Point;
  aim?: number;
  exactOrigin?: boolean;
  moonlet?: ScheduledMoonlet;
}>;

type MutableRoot = {
  at: number;
  localOrdinal: number;
  effectIds: Set<string>;
  spec: Omit<ProjectileSpec, "triggerId">;
  locket: boolean;
};

const degrees = Math.PI / 180;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const cloneBehaviors = (behaviors: ProjectileBehaviors): ProjectileBehaviors => Object.freeze(Object.fromEntries(
  Object.entries(behaviors).map(([key, value]) => [key, value && typeof value === "object" ? Object.freeze({ ...value }) : value]),
));

const freezeSpec = (spec: Omit<ProjectileSpec, "triggerId">): ScheduledProjectile["spec"] => Object.freeze({
  ...spec,
  behaviors: cloneBehaviors(spec.behaviors),
  ...(spec.bell && { bell: Object.freeze({ ...spec.bell }) }),
});

export function compareScheduledProjectiles(a: ScheduledProjectile, b: ScheduledProjectile): number {
  return a.at - b.at || a.rootIndex - b.rootIndex || a.localOrdinal - b.localOrdinal;
}

export function expandTrigger(context: TriggerContext) {
  const trigger = <Kind extends CombatBuild["triggers"][number]["kind"]>(kind: Kind) =>
    context.build.triggers.find((rule): rule is Extract<CombatBuild["triggers"][number], { kind: Kind }> => rule.kind === kind);
  const emission = <Kind extends CombatBuild["emissions"][number]["kind"]>(kind: Kind, artifactId?: ArtifactId) =>
    context.build.emissions.find((rule): rule is Extract<CombatBuild["emissions"][number], { kind: Kind }> =>
      rule.kind === kind && (!artifactId || rule.artifactId === artifactId));
  const allRules: readonly ArtifactRule[] = [
    ...context.build.triggers,
    ...context.build.motions,
    ...context.build.impacts,
    ...context.build.emissions,
    ...context.build.areas,
  ].sort((a, b) => a.phase - b.phase || a.effectId.localeCompare(b.effectId));
  const orderedEffects = (effectIds: Iterable<string>): readonly string[] => {
    const ids = new Set(effectIds);
    const known = allRules.filter(({ effectId }) => ids.delete(effectId)).map(({ effectId }) => effectId);
    return Object.freeze(["baseRevolver.direct", ...known, ...[...ids].filter((id) => id !== "baseRevolver.direct").sort()]);
  };
  const inherited = allRules.filter((rule) => {
    if (rule.family === "trigger") return false;
    if (rule.family === "motion") return rule.kind !== "converge" && rule.kind !== "orbit";
    if (rule.family === "emission") return rule.kind !== "echo" && rule.kind !== "pulseRing";
    if (rule.family === "area") return rule.kind !== "decoyInfluence" && rule.artifactId !== "lastBell" && rule.artifactId !== "bigIron";
    return true;
  }).map(({ effectId }) => effectId);

  const twin = trigger("twin");
  const tesla = trigger("fractionalMultishot");
  const fanRule = trigger("fan");
  const dealer = trigger("numberedSidePair");
  const stillwater = trigger("stationaryCharge");
  const lastRound = trigger("lastRound");
  const locket = trigger("lowHealthOrbital");
  const bigIron = trigger("heavyMainAndMoonlet");
  const posse = trigger("playerSatellite");
  const grave = trigger("delayedVolley");
  const teslaProc = Boolean(tesla && context.rng() < tesla.chance);
  const logicalCount = twin ? 2 + Number(teslaProc) : 1 + Number(teslaProc);
  const fan = fanRule ? fanRule.delays.map((delay, index) => ({
    delay,
    center: fanRule.centers[index]!,
  })) : [{ delay: 0, center: 0 }];
  const convergeDistance = twin
    ? clamp(context.aimDistance, twin.convergenceMin, twin.convergenceMax)
    : 0;
  const roots: MutableRoot[] = [];

  for (const volley of fan) {
    for (let logical = 0; logical < logicalCount; logical += 1) {
      const withTeslaPair = !twin && teslaProc;
      const headingOffset = twin ? 0 : withTeslaPair ? (logical === 0 ? -4 : 4) * degrees : 0;
      const teslaShot = teslaProc && logical === logicalCount - 1;
      const behaviors: ProjectileBehaviors = twin && logical < 2
        ? { ...context.weapon.projectileBase.behaviors, converge: {
          distance: convergeDistance,
          lateralOffset: logical === 0 ? -twin.lateralOffset : twin.lateralOffset,
        } }
        : context.weapon.projectileBase.behaviors;
      const effectIds = new Set(["baseRevolver.direct", ...inherited]);
      if (twin) effectIds.add(twin.effectId);
      if (teslaShot && tesla) effectIds.add(tesla.effectId);
      if (fanRule) effectIds.add(fanRule.effectId);
      roots.push({
        at: context.now + volley.delay,
        localOrdinal: roots.length,
        effectIds,
        spec: {
          ...context.weapon.projectileBase,
          heading: context.aim + volley.center + headingOffset,
          damage: context.weapon.projectileBase.damage * (twin ? twin.damageScale : 1) * (fanRule?.damageScale ?? 1),
          behaviors,
        },
        locket: false,
      });
    }
  }

  let dealerCounter = context.dealerCounter;
  let dealerDue = false;
  if (dealer) {
    dealerCounter += 1;
    if (dealerCounter >= dealer.cadence) {
      dealerCounter = 0;
      dealerDue = true;
    }
  }
  if (dealer && dealerDue) {
    for (const offset of [-dealer.angle, dealer.angle]) roots.push({
      at: context.now,
      localOrdinal: roots.length,
      effectIds: new Set(["baseRevolver.direct", ...inherited, dealer.effectId]),
      spec: {
        ...context.weapon.projectileBase,
        heading: context.aim + offset,
        damage: context.weapon.projectileBase.damage * dealer.damageScale,
      },
      locket: false,
    });
  }

  if (stillwater && context.stationaryCharged) for (const root of roots) {
    root.effectIds.add(stillwater.effectId);
    root.spec = {
      ...root.spec,
      damage: root.spec.damage * stillwater.damageScale,
      radius: root.spec.radius * stillwater.radiusScale,
      behaviors: { ...root.spec.behaviors, penetration: { obstacles: true, targets: true } },
    };
  }

  const bell = lastRound && context.round.ammoBefore === 1 ? roots[0] : undefined;
  const rings = emission("pulseRing", "lastBell");
  if (lastRound && rings && bell) {
    bell.effectIds.add(lastRound.effectId);
    bell.effectIds.add(rings.effectId);
    bell.spec = {
      ...bell.spec,
      damage: bell.spec.damage * lastRound.damageScale,
      speed: bell.spec.speed * lastRound.speedScale,
      radius: bell.spec.radius * lastRound.radiusScale,
      bell: { interval: rings.interval, count: rings.count, radius: rings.radius, damageScale: rings.damageScale },
    };
  }

  let locketState: LocketState = context.lowHealth ? context.locketState : { armed: false, cadence: 0 };
  if (locket && context.lowHealth) {
    if (!locketState.armed) {
      const cadence = locketState.cadence + 1;
      locketState = cadence >= locket.cadence ? { armed: true, cadence: 0 } : { armed: false, cadence };
    }
    const candidate = locketState.armed ? roots.findLast((root) => root !== bell) : undefined;
    if (candidate) {
      candidate.locket = true;
      candidate.effectIds.add(locket.effectId);
      locketState = { armed: false, cadence: 0 };
    }
  }

  if (bigIron) for (const root of roots) {
    if (root.locket) continue;
    root.effectIds.add(bigIron.effectId);
    const explosion = context.build.areas.find((rule) => rule.artifactId === "bigIron" && rule.kind === "explosion");
    if (explosion) root.effectIds.add(explosion.effectId);
    root.spec = {
      ...root.spec,
      damage: root.spec.damage * bigIron.damageScale,
      speed: root.spec.speed * bigIron.speedScale,
      radius: root.spec.radius * bigIron.radiusScale,
    };
  }

  if (context.weapon.projectileBase.behaviors.spiral) {
    for (const at of new Set(roots.map(({ at }) => at))) {
      const volley = roots.filter((root) => root.at === at).sort((a, b) => a.localOrdinal - b.localOrdinal);
      volley.forEach((root, index) => { root.spec = { ...root.spec, motionPhase: Math.PI * 2 * index / volley.length }; });
    }
  }

  const origin = Object.freeze({ ...context.origin });
  const scheduled: ScheduledProjectile[] = roots.map((root) => Object.freeze({
    at: root.at,
    generation: 0 as const,
    rootTriggerId: context.rootTriggerId,
    rootIndex: context.rootIndex,
    localOrdinal: root.localOrdinal,
    lineageId: `${context.rootTriggerId}:${root.localOrdinal}`,
    effectIds: orderedEffects(root.effectIds),
    spec: freezeSpec(root.spec),
    origin,
    aim: root.spec.heading,
  }));
  const generationZeroScheduled = scheduled.slice();

  const emissionEffectIds = new Set(context.build.emissions.map(({ effectId }) => effectId));
  const triggerEffectIds = new Set(context.build.triggers.map(({ effectId }) => effectId));
  const generationOneEffects = (effectIds: readonly string[]) => orderedEffects(effectIds.filter((effectId) =>
    !triggerEffectIds.has(effectId)
    && !emissionEffectIds.has(effectId)
    && effectId !== "lastBell.rings"
    && effectId !== "bigIron.kineticExplosion"
    && effectId !== "bigIron.moonletOrbit"
    && effectId !== "ectoplasmicWake.trail"
    && effectId !== "crossfireCovenant.cross"));

  if (bigIron) for (const source of generationZeroScheduled) {
    if (roots[source.localOrdinal]?.locket) continue;
    const { split: _, ...compatibleBehaviors } = source.spec.behaviors;
    scheduled.push(Object.freeze({
      at: source.at,
      generation: 1 as const,
      rootTriggerId: source.rootTriggerId,
      rootIndex: source.rootIndex,
      localOrdinal: scheduled.length,
      lineageId: source.lineageId,
      effectIds: generationOneEffects(source.effectIds),
      emission: Object.freeze({ artifactId: "bigIron", effectId: "bigIron.moonlet" }),
      spec: freezeSpec({
        ...source.spec,
        damage: source.spec.damage * bigIron.moonDamage,
        radius: source.spec.radius * bigIron.moonSize,
        behaviors: compatibleBehaviors,
        bell: undefined,
      }),
      origin,
      aim: source.spec.heading,
      exactOrigin: true,
      moonlet: Object.freeze({
        parentLineageId: source.lineageId,
        orbitRadius: bigIron.moonRadius,
        angularSpeed: bigIron.moonAngular,
        pairWindow: bigIron.pairWindow,
        explosionRadius: bigIron.explosionRadius,
        explosionDamageScale: bigIron.explosionDamage,
        knockback: bigIron.knockback,
        mainDamage: source.spec.damage,
        remainingRange: source.spec.speed * source.spec.lifetime,
      }),
    }));
  }

  let satellites = [...(context.satellites ?? [])]
    .filter(({ expiresAt }) => expiresAt > context.now)
    .sort((a, b) => a.bornAt - b.bornAt || a.id.localeCompare(b.id));
  if (satellites.length > 0) {
    const { split: _, ...compatibleBehaviors } = context.weapon.projectileBase.behaviors;
    const effectIds = generationOneEffects(orderedEffects(inherited));
    for (const satellite of satellites) scheduled.push(Object.freeze({
      at: context.now,
      generation: 1 as const,
      rootTriggerId: context.rootTriggerId,
      rootIndex: context.rootIndex,
      localOrdinal: scheduled.length,
      lineageId: `${context.rootTriggerId}:posse:${satellite.id}`,
      effectIds,
      emission: Object.freeze({ artifactId: "ghostPosse", effectId: "ghostPosse.shot" }),
      spec: freezeSpec({
        ...context.weapon.projectileBase,
        heading: context.aim,
        damage: context.weapon.projectileBase.damage * satellite.shotDamageScale,
        behaviors: compatibleBehaviors,
      }),
      origin: Object.freeze({ x: satellite.x, y: satellite.y }),
      aim: context.aim,
      exactOrigin: true,
    }));
    satellites = [];
  }
  if (posse) {
    const phase = context.rootIndex * Math.PI * (3 - Math.sqrt(5));
    satellites.push(Object.freeze({
      id: `satellite-${context.rootTriggerId}`,
      rootTriggerId: context.rootTriggerId,
      bornAt: context.now,
      expiresAt: context.now + posse.duration,
      radius: posse.radius,
      shotDamageScale: posse.damageScale,
      phase,
      x: context.origin.x + Math.cos(phase) * posse.radius,
      y: context.origin.y + Math.sin(phase) * posse.radius,
    }));
    if (satellites.length > posse.cap) satellites = satellites.slice(-posse.cap);
  }

  const copy = (
    source: ScheduledProjectile,
    provenance: EmissionProvenance,
    delay: number,
    damageScale: number,
  ): ScheduledProjectile => {
    const { split: _, ...compatibleBehaviors } = source.spec.behaviors;
    const effectIds = source.effectIds.filter((effectId) => !emissionEffectIds.has(effectId) && effectId !== "lastBell.rings");
    return Object.freeze({
      at: source.at + delay,
      generation: 1,
      rootTriggerId: source.rootTriggerId,
      rootIndex: source.rootIndex,
      localOrdinal: scheduled.length,
      lineageId: source.lineageId,
      effectIds: orderedEffects(effectIds),
      emission: Object.freeze({ ...provenance }),
      spec: freezeSpec({
        ...source.spec,
        damage: source.spec.damage * damageScale,
        behaviors: compatibleBehaviors,
        bell: undefined,
      }),
      origin,
      aim: source.spec.heading,
    });
  };

  for (const source of generationZeroScheduled) {
    if (roots[source.localOrdinal]?.locket) continue;
    if (context.round.echo) scheduled.push(copy(
      source,
      { artifactId: "deadeye", effectId: "deadeye.echo" },
      context.round.echo.delay,
      context.round.echo.damageScale,
    ));
    if (grave) scheduled.push(copy(
      source,
      { artifactId: "graveEcho", effectId: "graveEcho.copy" },
      grave.delay,
      grave.damageScale,
    ));
  }

  return Object.freeze({
    rootTriggerId: context.rootTriggerId,
    rootIndex: context.rootIndex,
    round: context.round,
    roundsConsumed: 1 as const,
    now: context.now,
    dealerCounter,
    locketState: Object.freeze(locketState),
    projectiles: Object.freeze(scheduled),
    satellites: Object.freeze(satellites),
  });
}
