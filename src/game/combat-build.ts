import { ARTIFACT_CATALOG, getOwnedArtifacts, type ArtifactId, type ArtifactLoadout } from "./artifacts";

export type Provenance = Readonly<{ artifactId: ArtifactId; effectId: string; phase: number }>;
type RuleOf<Family extends string, Specs extends Record<string, object>> = {
  [Kind in keyof Specs & string]: Provenance & Readonly<{ family: Family; kind: Kind }> & Readonly<Specs[Kind]>
}[keyof Specs & string];

type TriggerSpecs = {
  twin: { damageScale: number; convergenceMin: number; convergenceMax: number; lateralOffset: number };
  activeReload: { window: number; buff: number; duration: number; echoDelay: number; echoDamageScale: number };
  lastRound: { speedScale: number; radiusScale: number; damageScale: number; pulseInterval: number; pulseCount: number };
  delayedVolley: { delay: number; damageScale: number };
  fan: { delays: readonly [number, number, number]; centers: readonly [number, number, number]; damageScale: number };
  numberedSidePair: { cadence: number; angle: number; damageScale: number };
  fractionalMultishot: { chance: number; spread: number };
  heavyMainAndMoonlet: { radiusScale: number; damageScale: number; speedScale: number };
  playerSatellite: { radius: number; duration: number; cap: number; damageScale: number };
  recoil: { impulse: number; duration: number };
  stationaryCharge: { speedThreshold: number; chargeTime: number; damageScale: number; radiusScale: number };
  ammoReturn: { delivery: number };
  lowHealthOrbital: { healthThreshold: number; cadence: number; radius: number; duration: number; cap: number };
  hurtDecoy: { duration: number; invulnerability: number };
};
type MotionSpecs = {
  converge: { minDistance: number; maxDistance: number; lateralOffset: number };
  spiral: { initialRadius: number; radialSpeed: number; angularSpeed: number; lifetime: number };
  homing: { radius: number; turnRate: number };
  relay: { speedScale: number; radius: number; turnRate: number };
  wave: { amplitude: number; wavelength: number };
  return: { outbound: number; inbound: number; damageScale: number };
  comet: { duration: number; speedScale: number; radiusScale: number; damageScale: number };
  orbit: { radius: number; angularSpeed: number };
  distanceThreshold: { distance: number };
};
type ImpactSpecs = {
  bounce: { count: number; retention: number };
  penetration: { obstacles: boolean; targets: boolean };
  embeddedCharge: { storedDamageScale: number; duration: number };
  chill: { stacks: number; stackDuration: number; freezeDuration: number };
  burn: { ticks: number; interval: number; damageScale: number };
  brand: { duration: number; steering: number; jumpRadius: number };
  hitCounter: { hits: number; duration: number; damageScale: number };
  poolOnHit: { radius: number; duration: number; tickRate: number; damageScale: number; slow: number };
  statusPulse: { cadence: number; radius: number; slow: number; duration: number };
};
type EmissionSpecs = {
  echo: { delay: number; damageScale: number };
  pulseRing: { interval: number; count: number; radius: number; damageScale: number };
  splitCone: { distance: number; count: number; range: number; angle: number; damageScale: number; radiusScale: number };
  forwardShards: { count: number; angle: number; range: number; damageScale: number; radiusScale: number };
  expiryRadial: { count: number; range: number; damageScale: number; radiusScale: number };
  killSpirits: { count: number; radius: number; damageScale: number; turnRate: number };
  tangentCopy: { angle: number; range: number; damageScale: number; radiusScale: number };
  shatter: { count: number; range: number; damageScale: number; radiusScale: number };
  afterimage: { delay: number; range: number; damageScale: number };
};
type AreaSpecs = {
  projectileLink: { radius: number; neighbors: number; damageScale: number; cooldown: number };
  explosion: { radius: number; damageScale: number };
  trail: { width: number; duration: number; tickRate: number; damageScale: number; cooldown: number };
  pathCross: { length: number; damageScale: number; participationCap: number };
  decoyInfluence: { duration: number };
};

export type TriggerRule = RuleOf<"trigger", TriggerSpecs>;
export type MotionRule = RuleOf<"motion", MotionSpecs>;
export type ImpactRule = RuleOf<"impact", ImpactSpecs>;
export type EmissionRule = RuleOf<"emission", EmissionSpecs>;
export type AreaRule = RuleOf<"area", AreaSpecs>;
export type ArtifactRule = TriggerRule | MotionRule | ImpactRule | EmissionRule | AreaRule;

export type CombatBuild = Readonly<{
  triggers: readonly TriggerRule[];
  motions: readonly MotionRule[];
  impacts: readonly ImpactRule[];
  emissions: readonly EmissionRule[];
  areas: readonly AreaRule[];
  maxDescendants: number;
}>;

const stable = <T extends Provenance>(rules: readonly T[]): readonly T[] =>
  Object.freeze([...rules].sort((a, b) => a.phase - b.phase || a.effectId.localeCompare(b.effectId)));

const has = (loadout: ArtifactLoadout, id: ArtifactId) => loadout[id] === true;

function descendantBound(loadout: ArtifactLoadout): number {
  const logicalVolley = (has(loadout, "twinChamber") ? 2 : 1) + Number(has(loadout, "teslaBullets"));
  const roots = logicalVolley * (has(loadout, "fanThePhantom") ? 3 : 1)
    + (has(loadout, "dealersCut") ? 2 : 0);
  const perRoot =
    (has(loadout, "shotgun") ? 8 : 0)
    + (has(loadout, "deadeye") ? 1 : 0)
    + (has(loadout, "graveEcho") ? 1 : 0)
    + (has(loadout, "bigIron") ? 1 : 0)
    + (has(loadout, "boneOrchard") ? 3 : 0)
    + (has(loadout, "graveBloom") ? 6 : 0)
    + (has(loadout, "bootlegMint") ? 1 : 0)
    + (has(loadout, "coldcaster") ? 4 : 0)
    + (has(loadout, "dustlineDuel") ? 1 : 0);
  return roots * perRoot
    + (has(loadout, "soulHarvester") ? 2 : 0)
    + (has(loadout, "ghostPosse") ? 6 : 0);
}

export function compileCombatBuild(loadout: ArtifactLoadout): CombatBuild {
  const rules = getOwnedArtifacts(loadout).flatMap(({ rules }) => rules);
  return Object.freeze({
    triggers: stable(rules.filter((rule): rule is TriggerRule => rule.family === "trigger")),
    motions: stable(rules.filter((rule): rule is MotionRule => rule.family === "motion")),
    impacts: stable(rules.filter((rule): rule is ImpactRule => rule.family === "impact")),
    emissions: stable(rules.filter((rule): rule is EmissionRule => rule.family === "emission")),
    areas: stable(rules.filter((rule): rule is AreaRule => rule.family === "area")),
    maxDescendants: descendantBound(loadout),
  });
}

const EXCLUSIVE_MOTIONS = new Set<MotionRule["kind"]>([
  "converge", "spiral", "wave", "return", "comet", "orbit", "distanceThreshold",
]);
const INTEGER_FIELDS = new Set(["count", "pulseCount", "stacks", "ticks", "hits", "neighbors", "cadence", "cap", "participationCap"]);
const UNIT_FIELDS = new Set(["chance", "retention", "slow"]);

function numericEntries(value: unknown, path = ""): readonly [string, number][] {
  if (typeof value === "number") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => numericEntries(child, path ? `${path}.${key}` : key));
}

export function validateCombatBuild(build: CombatBuild): string[] {
  const errors: string[] = [];
  const groups = [
    ["trigger", build.triggers],
    ["motion", build.motions],
    ["impact", build.impacts],
    ["emission", build.emissions],
    ["area", build.areas],
  ] as const;
  const liveIds = new Set<string>(ARTIFACT_CATALOG.map(({ id }) => id));
  const effectIds = new Set<string>();

  for (const [family, rules] of groups) {
    const sorted = [...rules].sort((a, b) => a.phase - b.phase || a.effectId.localeCompare(b.effectId));
    if (rules.some((rule, index) => rule !== sorted[index])) errors.push(`${family} rules must be sorted by phase and effectId`);
    for (const rule of rules) {
      if (rule.family !== family) errors.push(`${rule.effectId || family} is in the wrong rule family`);
      if (!liveIds.has(rule.artifactId) || !rule.effectId || !Number.isInteger(rule.phase) || rule.phase < 0) {
        errors.push(`${rule.effectId || family} has invalid provenance`);
      }
      if (effectIds.has(rule.effectId)) errors.push(`duplicate effectId: ${rule.effectId}`);
      effectIds.add(rule.effectId);
      for (const [path, value] of numericEntries(rule)) {
        const field = path.split(".").at(-1)!;
        if (!Number.isFinite(value)) errors.push(`${rule.effectId}.${path} must be finite`);
        else if (INTEGER_FIELDS.has(field) && (!Number.isInteger(value) || value <= 0)) errors.push(`${rule.effectId}.${path} must be a positive integer`);
        else if (UNIT_FIELDS.has(field) && (value <= 0 || value > 1)) errors.push(`${rule.effectId}.${path} must be in (0, 1]`);
      }
      const unsafe = rule as ArtifactRule & { generation?: number; recursive?: boolean };
      if ((unsafe.generation ?? 1) > 1 || unsafe.recursive === true) errors.push(`${rule.effectId} exceeds generation depth one`);
    }
  }

  const motionKinds = new Set<string>();
  for (const rule of build.motions) {
    if (!EXCLUSIVE_MOTIONS.has(rule.kind)) continue;
    if (motionKinds.has(rule.kind)) errors.push(`duplicate exclusive motion kind: ${rule.kind}`);
    motionKinds.add(rule.kind);
  }
  for (const rule of build.areas) {
    if ("duration" in rule && rule.duration > 3) errors.push(`${rule.effectId}.duration must not exceed 3 seconds`);
    if ("tickRate" in rule && rule.tickRate > 10) errors.push(`${rule.effectId}.tickRate must not exceed 10 Hz`);
  }
  if (!Number.isInteger(build.maxDescendants) || build.maxDescendants < 0) errors.push("maxDescendants must be a nonnegative integer");
  if (build.maxDescendants > 384) errors.push("combat build exceeds the 384 descendant cap");
  return errors;
}
