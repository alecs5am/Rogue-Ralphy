const degrees = Math.PI / 180;

export type ArtifactEffect =
  | { kind: "addMultishot"; amount: number }
  | { kind: "multiplyDamage"; amount: number }
  | { kind: "multiplyRadius"; amount: number }
  | { kind: "spread"; radians: number }
  | { kind: "freeze"; chance: number; duration: number }
  | { kind: "bounce"; count: number; retention: number }
  | { kind: "activeReload"; window: number; buff: number; duration: number }
  | { kind: "spiral"; initialRadius: number; radialSpeed: number; angularSpeed: number; lifetime: number }
  | { kind: "homing"; radius: number; turnRate: number }
  | { kind: "tesla"; radius: number; neighbors: number; damageScale: number; cooldown: number }
  | { kind: "split"; distance: number; count: number; childRange: number; damageScale: number }
  | { kind: "penetration"; obstacles: boolean; targets: boolean };

export type ArtifactDefinition = {
  id: string;
  name: string;
  note: string;
  icon: string;
  category: "weapon" | "trajectory" | "status" | "utility";
  tags: readonly string[];
  effects: readonly ArtifactEffect[];
};

export const ARTIFACT_CATALOG = [
  { id: "twinChamber", name: "Twin Chamber", note: "2 projectiles · 8° spread", icon: "twinChamber", category: "weapon", tags: ["multishot", "spread"], effects: [{ kind: "addMultishot", amount: 1 }, { kind: "spread", radians: 8 * degrees }] },
  { id: "bigIron", name: "Big Iron", note: "+25% radius", icon: "bigIron", category: "weapon", tags: ["radius"], effects: [{ kind: "multiplyRadius", amount: 1.25 }] },
  { id: "hollowPoint", name: "Hollow Point", note: "+35% damage", icon: "hollowPoint", category: "weapon", tags: ["damage"], effects: [{ kind: "multiplyDamage", amount: 1.35 }] },
  { id: "coldcaster", name: "Coldcaster", note: "25% freeze · 1.05s", icon: "coldcaster", category: "status", tags: ["freeze"], effects: [{ kind: "freeze", chance: 0.25, duration: 1.05 }] },
  { id: "pinball", name: "Pinball", note: "1 bounce · 90% damage", icon: "pinball", category: "trajectory", tags: ["bounce"], effects: [{ kind: "bounce", count: 1, retention: 0.9 }] },
  { id: "deadeye", name: "Deadeye", note: "12% window · +20% rate · 2.25s", icon: "deadeye", category: "utility", tags: ["reload", "fire-rate"], effects: [{ kind: "activeReload", window: 0.12, buff: 0.2, duration: 2.25 }] },
  { id: "haloChamber", name: "Halo Chamber", note: "outward spiral · 4s", icon: "haloChamber", category: "trajectory", tags: ["spiral"], effects: [{ kind: "spiral", initialRadius: 24, radialSpeed: 48, angularSpeed: 3 * Math.PI, lifetime: 4 }] },
  { id: "ghostSight", name: "Ghost Sight", note: "540°/s turn · acquire radius 96", icon: "ghostSight", category: "trajectory", tags: ["homing"], effects: [{ kind: "homing", radius: 96, turnRate: 3 * Math.PI }] },
  { id: "teslaBullets", name: "Tesla Bullets", note: "+0.33 multishot · chain arcs", icon: "teslaBullets", category: "weapon", tags: ["multishot", "tesla"], effects: [{ kind: "addMultishot", amount: 0.33 }, { kind: "tesla", radius: 96, neighbors: 2, damageScale: 0.25, cooldown: 0.15 }] },
  { id: "shotgun", name: "Shotgun", note: "split after 160 px", icon: "shotgun", category: "trajectory", tags: ["split"], effects: [{ kind: "split", distance: 160, count: 8, childRange: 128, damageScale: 0.35 }] },
  { id: "spectralBullets", name: "Spectral Bullets", note: "pierce cover and targets", icon: "spectralBullets", category: "trajectory", tags: ["penetration", "spectral"], effects: [{ kind: "penetration", obstacles: true, targets: true }] },
] as const satisfies readonly ArtifactDefinition[];

export type ArtifactId = (typeof ARTIFACT_CATALOG)[number]["id"];
export type ArtifactLoadout = Partial<Record<ArtifactId, true>>;

const positive = (value: number) => Number.isFinite(value) && value > 0;
const probability = (value: number) => positive(value) && value <= 1;

function validateEffect(effect: ArtifactEffect, prefix: string): string[] {
  switch (effect.kind) {
    case "addMultishot":
    case "multiplyDamage":
    case "multiplyRadius":
      return positive(effect.amount) ? [] : [`${prefix}.${effect.kind}.amount must be finite and positive`];
    case "spread": return positive(effect.radians) ? [] : [`${prefix}.spread.radians must be finite and positive`];
    case "freeze": return probability(effect.chance) && positive(effect.duration) ? [] : [`${prefix}.freeze parameters must be finite and positive`];
    case "bounce": return Number.isInteger(effect.count) && positive(effect.count) && probability(effect.retention) ? [] : [`${prefix}.bounce parameters must be finite and positive`];
    case "activeReload": return positive(effect.window) && positive(effect.buff) && positive(effect.duration) ? [] : [`${prefix}.activeReload parameters must be finite and positive`];
    case "spiral": return positive(effect.initialRadius) && positive(effect.radialSpeed) && positive(effect.angularSpeed) && positive(effect.lifetime) ? [] : [`${prefix}.spiral parameters must be finite and positive`];
    case "homing": return positive(effect.radius) && positive(effect.turnRate) ? [] : [`${prefix}.homing parameters must be finite and positive`];
    case "tesla": return positive(effect.radius) && Number.isInteger(effect.neighbors) && positive(effect.neighbors) && probability(effect.damageScale) && positive(effect.cooldown) ? [] : [`${prefix}.tesla parameters must be finite and positive`];
    case "split": return positive(effect.distance) && Number.isInteger(effect.count) && positive(effect.count) && positive(effect.childRange) && probability(effect.damageScale) ? [] : [`${prefix}.split parameters must be finite and positive`];
    case "penetration": return [];
  }
}

export function validateArtifactCatalog(catalog: readonly ArtifactDefinition[]): string[] {
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const definition of catalog) {
    if (!definition.id || ids.has(definition.id)) errors.push(`duplicate artifact id: ${definition.id}`);
    ids.add(definition.id);
    if (!definition.name || !definition.note || !definition.icon) errors.push(`artifact ${definition.id} must include display metadata`);
    definition.effects.forEach((effect, index) => errors.push(...validateEffect(effect, `${definition.id}.effects[${index}]`)));
  }
  return errors;
}

export function getOwnedArtifacts(loadout: ArtifactLoadout): readonly (typeof ARTIFACT_CATALOG)[number][] {
  for (const [id, value] of Object.entries(loadout)) {
    if (value !== true) throw new Error(`${id} must be true when present`);
  }
  return ARTIFACT_CATALOG.filter((definition) => loadout[definition.id] === true);
}
