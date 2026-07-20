import {
  ARTIFACT_HUD_ASSETS,
  ARTIFACT_PRESENTATION_ASSETS,
  type AssetKey,
} from "./assets";
import {
  ARTIFACT_IDS,
  type ArtifactFamily,
  type ArtifactId,
} from "./game/artifacts";
import type { VfxCommand } from "./game/combat-effects";
import type { ProjectileState } from "./game/projectiles";
import type { Point } from "./game/room";
import type { GameState } from "./game/simulation";

export type ArtifactEffectSource =
  | "VfxCommand"
  | "targetStatus"
  | "projectileMotion"
  | "area"
  | "link"
  | "satellite/orbital"
  | "decoy"
  | "HUD";

export type EffectDrawLayer =
  | "areas-trails"
  | "target-cues"
  | "links"
  | "projectiles"
  | "emission-cues"
  | "satellites-orbitals-decoy"
  | "hud";

export type ReducedMotionPolicy = "preserve" | "freeze" | "shorten-trail";
export type ArtifactEffectAsset =
  | (typeof ARTIFACT_PRESENTATION_ASSETS)[number]
  | (typeof ARTIFACT_HUD_ASSETS)[number];

export type ArtifactEffectContract = Readonly<{
  artifactId: ArtifactId;
  source: ArtifactEffectSource;
  assets: readonly ArtifactEffectAsset[];
  family: ArtifactFamily;
  layer: EffectDrawLayer;
  essential: boolean;
  reducedMotion: ReducedMotionPolicy;
}>;

export const ARTIFACT_EFFECT_CONTRACT = [
  { artifactId: "twinChamber", source: "projectileMotion", assets: ["twinWeave"], family: "trigger", layer: "projectiles", essential: true, reducedMotion: "freeze" },
  { artifactId: "deadeye", source: "projectileMotion", assets: ["echoFlash", "ammoEcho"], family: "trigger", layer: "emission-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "lastBell", source: "VfxCommand", assets: ["bellRing"], family: "trigger", layer: "emission-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "graveEcho", source: "projectileMotion", assets: ["echoFlash"], family: "trigger", layer: "emission-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "fanThePhantom", source: "projectileMotion", assets: ["burstFlash"], family: "trigger", layer: "emission-cues", essential: false, reducedMotion: "freeze" },
  { artifactId: "dealersCut", source: "projectileMotion", assets: ["sideShotFlash", "dealerCut1", "dealerCut2", "dealerCut3"], family: "trigger", layer: "emission-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "haloChamber", source: "projectileMotion", assets: ["orbitTrail"], family: "motion", layer: "projectiles", essential: true, reducedMotion: "freeze" },
  { artifactId: "ghostSight", source: "projectileMotion", assets: ["homingMarker"], family: "motion", layer: "target-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "pinball", source: "VfxCommand", assets: ["pinballRelay"], family: "motion", layer: "links", essential: true, reducedMotion: "freeze" },
  { artifactId: "wailingLead", source: "projectileMotion", assets: ["waveTrail"], family: "motion", layer: "projectiles", essential: false, reducedMotion: "freeze" },
  { artifactId: "undertakersReturn", source: "projectileMotion", assets: ["returnLoop"], family: "motion", layer: "projectiles", essential: true, reducedMotion: "freeze" },
  { artifactId: "cometSpur", source: "projectileMotion", assets: ["cometTail"], family: "motion", layer: "projectiles", essential: false, reducedMotion: "freeze" },
  { artifactId: "shotgun", source: "VfxCommand", assets: ["shotgunSplit"], family: "impact", layer: "emission-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "hollowPoint", source: "VfxCommand", assets: ["hollowExplosion"], family: "impact", layer: "areas-trails", essential: true, reducedMotion: "freeze" },
  { artifactId: "boneOrchard", source: "projectileMotion", assets: ["boneFan"], family: "impact", layer: "emission-cues", essential: false, reducedMotion: "freeze" },
  { artifactId: "graveBloom", source: "projectileMotion", assets: ["graveBloomVfx"], family: "impact", layer: "emission-cues", essential: false, reducedMotion: "freeze" },
  { artifactId: "soulHarvester", source: "projectileMotion", assets: ["soulSpirit"], family: "impact", layer: "emission-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "bootlegMint", source: "projectileMotion", assets: ["coinMint"], family: "impact", layer: "emission-cues", essential: false, reducedMotion: "freeze" },
  { artifactId: "coldcaster", source: "VfxCommand", assets: ["chillMark", "iceShatter"], family: "status", layer: "target-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "cinderGospel", source: "VfxCommand", assets: ["burnMark", "emberRing"], family: "status", layer: "target-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "wantedBrand", source: "targetStatus", assets: ["wantedMark"], family: "status", layer: "target-cues", essential: true, reducedMotion: "preserve" },
  { artifactId: "widowsLedger", source: "VfxCommand", assets: ["ledgerMark"], family: "status", layer: "target-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "ectoplasmSnare", source: "area", assets: ["ectoplasmPool"], family: "status", layer: "areas-trails", essential: true, reducedMotion: "preserve" },
  { artifactId: "hexBell", source: "VfxCommand", assets: ["hexPulse"], family: "status", layer: "target-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "spectralBullets", source: "projectileMotion", assets: ["spectralTrail"], family: "relation", layer: "projectiles", essential: true, reducedMotion: "freeze" },
  { artifactId: "teslaBullets", source: "link", assets: ["teslaArc"], family: "relation", layer: "links", essential: true, reducedMotion: "freeze" },
  { artifactId: "bigIron", source: "projectileMotion", assets: ["ironMoonlet", "kineticExplosion"], family: "relation", layer: "projectiles", essential: true, reducedMotion: "freeze" },
  { artifactId: "ghostPosse", source: "satellite/orbital", assets: ["ghostSatellite"], family: "relation", layer: "satellites-orbitals-decoy", essential: true, reducedMotion: "freeze" },
  { artifactId: "ectoplasmicWake", source: "area", assets: ["ectoplasmTrail"], family: "relation", layer: "areas-trails", essential: true, reducedMotion: "shorten-trail" },
  { artifactId: "crossfireCovenant", source: "area", assets: ["crossfirePulse"], family: "relation", layer: "areas-trails", essential: true, reducedMotion: "freeze" },
  { artifactId: "recoilBoots", source: "VfxCommand", assets: ["recoilSkid"], family: "reactive", layer: "emission-cues", essential: false, reducedMotion: "freeze" },
  { artifactId: "stillwater", source: "VfxCommand", assets: ["stillwaterWard"], family: "reactive", layer: "satellites-orbitals-decoy", essential: true, reducedMotion: "freeze" },
  { artifactId: "dustlineDuel", source: "VfxCommand", assets: ["dustlineAfterimage"], family: "reactive", layer: "emission-cues", essential: true, reducedMotion: "freeze" },
  { artifactId: "bonanzaClip", source: "HUD", assets: ["goldSoul"], family: "reactive", layer: "hud", essential: true, reducedMotion: "preserve" },
  { artifactId: "lastGaspLocket", source: "satellite/orbital", assets: ["locketOrbital"], family: "reactive", layer: "satellites-orbitals-decoy", essential: true, reducedMotion: "freeze" },
  { artifactId: "undertakersCoat", source: "decoy", assets: ["coatDecoy"], family: "reactive", layer: "satellites-orbitals-decoy", essential: true, reducedMotion: "preserve" },
] as const satisfies readonly ArtifactEffectContract[];

const allowedAssets = new Set<AssetKey>([
  ...ARTIFACT_PRESENTATION_ASSETS,
  ...ARTIFACT_HUD_ASSETS,
]);
for (const row of ARTIFACT_EFFECT_CONTRACT) {
  for (const asset of row.assets) {
    if (!allowedAssets.has(asset)) throw new Error(`Artifact contract uses an unregistered asset: ${asset}`);
  }
}
if (ARTIFACT_EFFECT_CONTRACT.length !== ARTIFACT_IDS.length
  || ARTIFACT_EFFECT_CONTRACT.some((row, index) => row.artifactId !== ARTIFACT_IDS[index])) {
  throw new Error("Artifact presentation contract must cover the ordered catalog exactly once");
}

const contractByArtifact = new Map<ArtifactId, ArtifactEffectContract>(
  ARTIFACT_EFFECT_CONTRACT.map((row) => [row.artifactId, row]),
);

export type EffectDrawGeometry =
  | Readonly<{ type: "sprite"; x: number; y: number; size: number; rotation: number }>
  | Readonly<{ type: "disc"; x: number; y: number; radius: number }>
  | Readonly<{
    type: "path";
    segments: readonly Readonly<{ from: Point; to: Point }>[];
    width: number;
  }>
  | Readonly<{ type: "hudDelivery"; from: Point; slot: number; arrivesAt: number }>;

export type EffectDraw = Readonly<{
  id: string;
  artifactId: ArtifactId;
  effectId: string;
  rootTriggerId: string;
  lineageId?: string;
  bornAt: number;
  expiresAt: number;
  asset: ArtifactEffectAsset;
  family: ArtifactFamily;
  layer: EffectDrawLayer;
  essential: boolean;
  animatable: boolean;
  phase: number;
  trailPersistence: number;
  geometry: EffectDrawGeometry;
}>;

const layerOrder: Record<EffectDrawLayer, number> = {
  "areas-trails": 0,
  "target-cues": 1,
  links: 2,
  projectiles: 3,
  "emission-cues": 4,
  "satellites-orbitals-decoy": 5,
  hud: 6,
};

const artifactIds = new Set<string>(ARTIFACT_IDS);
const isArtifactId = (value: string): value is ArtifactId => artifactIds.has(value);
const hasEffect = (projectile: ProjectileState, effectId: string): boolean =>
  projectile.activatedEffectIds.includes(effectId);
const projectileSprite = (projectile: ProjectileState, scale = 3): EffectDrawGeometry => ({
  type: "sprite",
  x: projectile.x,
  y: projectile.y,
  size: Math.max(18, projectile.radius * scale),
  rotation: Math.atan2(projectile.vy, projectile.vx),
});
const projectileTrail = (projectile: ProjectileState, length = 34): EffectDrawGeometry => {
  const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
  return {
    type: "path",
    segments: [{
      from: { x: projectile.x - projectile.vx / speed * length, y: projectile.y - projectile.vy / speed * length },
      to: { x: projectile.x, y: projectile.y },
    }],
    width: Math.max(6, projectile.radius * 1.5),
  };
};

type DrawSeed = Omit<EffectDraw,
  "family" | "layer" | "essential" | "animatable" | "phase" | "trailPersistence"
> & Readonly<{
  bornAt: number;
  expiresAt: number;
  layer?: EffectDrawLayer;
}>;

const toDraw = (seed: DrawSeed, now: number, reducedMotion: boolean): EffectDraw => {
  const contract = contractByArtifact.get(seed.artifactId)!;
  const duration = Math.max(0, seed.expiresAt - seed.bornAt);
  const animatable = contract.reducedMotion !== "preserve";
  return {
    id: seed.id,
    artifactId: seed.artifactId,
    effectId: seed.effectId,
    rootTriggerId: seed.rootTriggerId,
    ...(seed.lineageId ? { lineageId: seed.lineageId } : {}),
    bornAt: seed.bornAt,
    expiresAt: seed.expiresAt,
    asset: seed.asset,
    family: contract.family,
    layer: seed.layer ?? contract.layer,
    essential: contract.essential,
    animatable,
    phase: !animatable || reducedMotion || duration === 0
      ? 0
      : Math.max(0, Math.min(1, (now - seed.bornAt) / duration)),
    trailPersistence: reducedMotion && contract.reducedMotion === "shorten-trail" ? Math.min(0.18, duration) : duration,
    geometry: seed.geometry,
  };
};

const targetPoint = (state: GameState, targetId: string, fallback: Point): Point => {
  const target = state.targets.find(({ id }) => id === targetId);
  return target ? { x: target.x, y: target.y } : fallback;
};
const isLiveCommand = (command: VfxCommand, now: number): boolean =>
  command.bornAt <= now && command.expiresAt > now;

const commandAsset = (command: VfxCommand): ArtifactEffectAsset => {
  switch (command.kind) {
    case "recoilBoots.skid": return "recoilSkid";
    case "stillwater.ward": return "stillwaterWard";
    case "undertakersCoat.decoy": return "coatDecoy";
    case "coldcaster.chill": return "chillMark";
    case "coldcaster.freeze": return "iceShatter";
    case "cinderGospel.burn": return "burnMark";
    case "wantedBrand.mark": return "wantedMark";
    case "widowsLedger.notch":
    case "widowsLedger.line": return "ledgerMark";
    case "lastGaspLocket.consume":
    case "lastGaspLocket.orbital": return "locketOrbital";
    case "pinball.relay": return "pinballRelay";
    case "hollowPoint.explosion": return "hollowExplosion";
    case "ectoplasmSnare.pool": return "ectoplasmPool";
    case "bigIron.kineticExplosion": return "kineticExplosion";
    case "lastBell.ring": return "bellRing";
    case "cinderGospel.emberRing": return "emberRing";
    case "hexBell.pulse": return "hexPulse";
    case "shotgun.split": return "shotgunSplit";
    case "dustlineDuel.snapshot":
    case "dustlineDuel.fire": return "dustlineAfterimage";
    case "ectoplasmicWake.trail": return "ectoplasmTrail";
    case "crossfireCovenant.cross": return "crossfirePulse";
    case "bonanza.delivery": return "goldSoul";
    default: return assertNever(command);
  }
};

const commandGeometry = (command: VfxCommand, state: GameState): EffectDrawGeometry => {
  switch (command.geometry.type) {
    case "point":
      return { type: "sprite", x: command.geometry.at.x, y: command.geometry.at.y, size: 54, rotation: 0 };
    case "target": {
      const at = targetPoint(state, command.geometry.targetId, command.geometry.at);
      return { type: "sprite", x: at.x, y: at.y, size: 54, rotation: 0 };
    }
    case "segment":
      return { type: "path", segments: [{ from: command.geometry.from, to: command.geometry.to }], width: 18 };
    case "link":
      return { type: "path", segments: [{ from: command.geometry.from, to: command.geometry.to }], width: 14 };
    case "radius": {
      const center = command.kind === "hexBell.pulse"
        ? targetPoint(state, command.targetId, command.geometry.center)
        : command.geometry.center;
      return { type: "disc", x: center.x, y: center.y, radius: command.geometry.radius };
    }
    case "heading":
      if (command.kind === "shotgun.split") return {
        type: "sprite",
        x: command.geometry.at.x,
        y: command.geometry.at.y,
        size: 54,
        rotation: command.geometry.heading,
      };
      return {
        type: "path",
        segments: [{
          from: command.geometry.at,
          to: {
            x: command.geometry.at.x + Math.cos(command.geometry.heading) * 72,
            y: command.geometry.at.y + Math.sin(command.geometry.heading) * 72,
          },
        }],
        width: 20,
      };
    case "polyline":
      return {
        type: "path",
        segments: command.geometry.segments.map(({ from, to }) => ({ from, to })),
        width: Math.max(...command.geometry.segments.map(({ width }) => width)),
      };
    case "pair":
      return {
        type: "path",
        segments: [command.geometry.first, command.geometry.second],
        width: 18,
      };
    case "orbit":
      return {
        type: "sprite",
        x: command.geometry.center.x + Math.cos(command.geometry.angle) * command.geometry.radius,
        y: command.geometry.center.y + Math.sin(command.geometry.angle) * command.geometry.radius,
        size: 42,
        rotation: command.geometry.angle,
      };
    case "hudDelivery":
      return {
        type: "hudDelivery",
        from: command.geometry.from,
        slot: command.geometry.slot,
        arrivesAt: command.geometry.arrivesAt,
      };
    default:
      return assertNever(command.geometry);
  }
};

const commandLayer = (command: VfxCommand): EffectDrawLayer => {
  switch (command.kind) {
    case "hollowPoint.explosion":
    case "ectoplasmSnare.pool":
    case "bigIron.kineticExplosion":
    case "lastBell.ring":
    case "cinderGospel.emberRing":
    case "ectoplasmicWake.trail":
    case "crossfireCovenant.cross":
      return "areas-trails";
    case "coldcaster.chill":
    case "coldcaster.freeze":
    case "cinderGospel.burn":
    case "wantedBrand.mark":
    case "widowsLedger.notch":
    case "widowsLedger.line":
    case "lastGaspLocket.consume":
    case "hexBell.pulse":
      return "target-cues";
    case "pinball.relay":
      return "links";
    case "recoilBoots.skid":
    case "shotgun.split":
    case "dustlineDuel.snapshot":
    case "dustlineDuel.fire":
      return "emission-cues";
    case "stillwater.ward":
    case "undertakersCoat.decoy":
    case "lastGaspLocket.orbital":
      return "satellites-orbitals-decoy";
    case "bonanza.delivery":
      return "hud";
    default:
      return assertNever(command);
  }
};

const hasLiveStateSource = (command: VfxCommand, state: GameState): boolean => {
  if (command.kind === "wantedBrand.mark")
    return state.wantedBrand?.targetId === command.geometry.targetId && state.wantedBrand.expiresAt > state.time;
  if (command.kind === "ectoplasmSnare.pool")
    return state.areas.some((area) => area.artifactId === "ectoplasmSnare"
      && area.rootTriggerId === command.rootTriggerId && area.expiresAt > state.time);
  if (command.kind === "ectoplasmicWake.trail")
    return Object.values(state.wakeTrails).some((wake) => wake.rootTriggerId === command.rootTriggerId
      && wake.segments.some(({ expiresAt }) => expiresAt > state.time));
  if (command.kind === "lastGaspLocket.orbital")
    return state.locketOrbitals.some((orbital) => orbital.rootTriggerId === command.rootTriggerId
      && orbital.lineageId === command.lineageId && orbital.expiresAt > state.time);
  if (command.kind === "undertakersCoat.decoy") return state.decoy != null && state.decoy.expiresAt > state.time;
  return false;
};

const projectCommands = (state: GameState, reducedMotion: boolean): EffectDraw[] =>
  state.vfxCommands
    .filter((command) => isLiveCommand(command, state.time) && !hasLiveStateSource(command, state))
    .map((command) => {
      if (!isArtifactId(command.artifactId))
        throw new Error(`Closed VFX command has unknown artifact provenance: ${command.artifactId}`);
      return toDraw({
        id: `command:${command.id}`,
        artifactId: command.artifactId,
        effectId: command.effectId,
        rootTriggerId: command.rootTriggerId,
        ...(command.lineageId ? { lineageId: command.lineageId } : {}),
        asset: commandAsset(command),
        layer: commandLayer(command),
        bornAt: command.bornAt,
        expiresAt: command.expiresAt,
        geometry: commandGeometry(command, state),
      }, state.time, reducedMotion);
    });

const emissionAssets: Partial<Record<ArtifactId, ArtifactEffectAsset>> = {
  deadeye: "echoFlash",
  graveEcho: "echoFlash",
  fanThePhantom: "burstFlash",
  dealersCut: "sideShotFlash",
  boneOrchard: "boneFan",
  graveBloom: "graveBloomVfx",
  soulHarvester: "soulSpirit",
  bootlegMint: "coinMint",
  coldcaster: "iceShatter",
  bigIron: "ironMoonlet",
  ghostPosse: "ghostSatellite",
};

const projectileDraw = (
  projectile: ProjectileState,
  artifactId: ArtifactId,
  effectId: string,
  asset: ArtifactEffectAsset,
  geometry: EffectDrawGeometry,
  state: GameState,
  reducedMotion: boolean,
): EffectDraw => toDraw({
  id: `projectile:${projectile.id}:${effectId}`,
  artifactId,
  effectId,
  rootTriggerId: projectile.rootTriggerId,
  lineageId: projectile.lineageId,
  asset,
  bornAt: projectile.bornAt,
  expiresAt: projectile.bornAt + projectile.lifetime,
  geometry,
}, state.time, reducedMotion);

const projectProjectiles = (state: GameState, reducedMotion: boolean): EffectDraw[] => {
  const draws: EffectDraw[] = [];
  for (const projectile of state.projectiles) {
    const add = (
      artifactId: ArtifactId,
      effectId: string,
      asset: ArtifactEffectAsset,
      geometry: EffectDrawGeometry = projectileSprite(projectile),
    ) => draws.push(projectileDraw(projectile, artifactId, effectId, asset, geometry, state, reducedMotion));

    if (hasEffect(projectile, "twinChamber.pair"))
      add("twinChamber", "twinChamber.pair", "twinWeave");
    if (hasEffect(projectile, "lastBell.round"))
      add("lastBell", "lastBell.round", "bellRing", {
        type: "disc", x: projectile.x, y: projectile.y, radius: Math.max(18, projectile.radius * 2.2),
      });
    if (hasEffect(projectile, "fanThePhantom.fan"))
      add("fanThePhantom", "fanThePhantom.fan", "burstFlash");
    if (hasEffect(projectile, "dealersCut.sidePair"))
      add("dealersCut", "dealersCut.sidePair", "sideShotFlash");
    if (hasEffect(projectile, "haloChamber.spiral"))
      add("haloChamber", "haloChamber.spiral", "orbitTrail", projectileTrail(projectile, 30));
    if (hasEffect(projectile, "ghostSight.homing")
      && (projectile.homingMarkerRemaining ?? 0) > 0 && projectile.homingTargetId) {
      const target = state.targets.find(({ id }) => id === projectile.homingTargetId);
      if (target) add("ghostSight", "ghostSight.homing", "homingMarker", {
        type: "sprite", x: target.x, y: target.y, size: target.radius * 2.8, rotation: 0,
      });
    }
    if (hasEffect(projectile, "wailingLead.wave"))
      add("wailingLead", "wailingLead.wave", "waveTrail", projectileTrail(projectile, 44));
    if (hasEffect(projectile, "undertakersReturn.return"))
      add("undertakersReturn", "undertakersReturn.return", "returnLoop");
    if (hasEffect(projectile, "cometSpur.comet"))
      add("cometSpur", "cometSpur.comet", "cometTail", projectileTrail(projectile, 52));

    if (projectile.splitParentId != null
      && projectile.emission == null
      && hasEffect(projectile, "shotgun.split")) {
      add("shotgun", "shotgun.split", "shotgunSplit");
    }
    if (hasEffect(projectile, "spectralBullets.penetration"))
      add("spectralBullets", "spectralBullets.penetration", "spectralTrail", projectileTrail(projectile));

    if (projectile.bigIronMain)
      add("bigIron", "bigIron.heavy", "ironMoonlet");
    else if (projectile.moonlet || projectile.emission?.artifactId === "bigIron")
      add("bigIron", projectile.emission?.effectId ?? "bigIron.moonletOrbit", "ironMoonlet", projectileSprite(projectile, 3.5));

    const emission = projectile.emission;
    if (emission && isArtifactId(emission.artifactId)) {
      const asset = emissionAssets[emission.artifactId];
      if (asset && emission.artifactId !== "bigIron")
        add(emission.artifactId, emission.effectId, asset);
    }
  }
  return draws;
};

const projectAreas = (state: GameState, reducedMotion: boolean): EffectDraw[] => {
  const draws: EffectDraw[] = [];
  for (const area of state.areas) {
    if (area.bornAt > state.time || area.expiresAt <= state.time
      || area.artifactId !== "ectoplasmSnare" || !("x" in area) || !("radius" in area)) continue;
    draws.push(toDraw({
      id: `area:${area.id}`,
      artifactId: "ectoplasmSnare",
      effectId: area.effectId,
      rootTriggerId: area.rootTriggerId,
      ...("lineageId" in area && area.lineageId ? { lineageId: area.lineageId } : {}),
      asset: "ectoplasmPool",
      bornAt: area.bornAt,
      expiresAt: area.expiresAt,
      geometry: { type: "disc", x: area.x, y: area.y, radius: area.radius },
    }, state.time, reducedMotion));
  }
  for (const wake of Object.values(state.wakeTrails)) {
    const activeSegments = wake.segments
      .filter(({ bornAt, expiresAt }) => bornAt <= state.time && expiresAt > state.time)
      .map((segment) => {
        if (state.time >= segment.completeAt) return segment;
        const formation = Math.max(0, Math.min(1,
          (state.time - segment.bornAt) / Math.max(Number.EPSILON, segment.completeAt - segment.bornAt)));
        return {
          ...segment,
          to: {
            x: segment.from.x + (segment.to.x - segment.from.x) * formation,
            y: segment.from.y + (segment.to.y - segment.from.y) * formation,
          },
        };
      });
    if (activeSegments.length === 0) continue;
    const bornAt = Math.min(...activeSegments.map(({ bornAt }) => bornAt));
    const expiresAt = Math.max(...activeSegments.map(({ expiresAt }) => expiresAt));
    draws.push(toDraw({
      id: `wake:${wake.lineageId}`,
      artifactId: "ectoplasmicWake",
      effectId: wake.effectId,
      rootTriggerId: wake.rootTriggerId,
      lineageId: wake.lineageId,
      asset: "ectoplasmTrail",
      bornAt,
      expiresAt,
      geometry: {
        type: "path",
        segments: activeSegments.map(({ from, to }) => ({ from, to })),
        width: wake.width,
      },
    }, state.time, reducedMotion));
  }
  for (const pulse of state.crossfirePulses) {
    if (pulse.bornAt > state.time || pulse.expiresAt <= state.time
      || state.vfxCommands.some((command) => isLiveCommand(command, state.time)
        && command.kind === "crossfireCovenant.cross"
        && command.rootTriggerId === pulse.rootTriggerId
        && command.geometry.pairId === pulse.pairId)) continue;
    draws.push(toDraw({
      id: `crossfire:${pulse.id}`,
      artifactId: "crossfireCovenant",
      effectId: "crossfireCovenant.cross",
      rootTriggerId: pulse.rootTriggerId,
      asset: "crossfirePulse",
      bornAt: pulse.bornAt,
      expiresAt: pulse.expiresAt,
      geometry: {
        type: "path",
        segments: [
          {
            from: { x: pulse.x - pulse.ax * pulse.length / 2, y: pulse.y - pulse.ay * pulse.length / 2 },
            to: { x: pulse.x + pulse.ax * pulse.length / 2, y: pulse.y + pulse.ay * pulse.length / 2 },
          },
          {
            from: { x: pulse.x - pulse.bx * pulse.length / 2, y: pulse.y - pulse.by * pulse.length / 2 },
            to: { x: pulse.x + pulse.bx * pulse.length / 2, y: pulse.y + pulse.by * pulse.length / 2 },
          },
        ],
        width: 18,
      },
    }, state.time, reducedMotion));
  }
  return draws;
};

const projectLinks = (state: GameState, reducedMotion: boolean): EffectDraw[] => {
  const byId = new Map(state.projectiles.map((projectile) => [projectile.id, projectile]));
  return state.teslaLinks.flatMap((link) => {
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b) return [];
    const source = a.damage < b.damage || (a.damage === b.damage && a.id < b.id) ? a : b;
    return [toDraw({
      id: `link:${link.id}`,
      artifactId: "teslaBullets",
      effectId: "teslaBullets.link",
      rootTriggerId: source.rootTriggerId,
      lineageId: source.lineageId,
      asset: "teslaArc",
      bornAt: Math.max(a.bornAt, b.bornAt),
      expiresAt: Math.min(a.bornAt + a.lifetime, b.bornAt + b.lifetime),
      geometry: { type: "path", segments: [{ from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y } }], width: 12 },
    }, state.time, reducedMotion)];
  });
};

const projectTargetStatuses = (state: GameState, reducedMotion: boolean): EffectDraw[] => {
  const targetCommandEffects = new Set(state.vfxCommands
    .filter((command) => isLiveCommand(command, state.time))
    .flatMap((command) => command.geometry.type === "target"
      ? [`${command.effectId}\0${command.rootTriggerId}\0${command.geometry.targetId}`]
      : []));
  const draws: EffectDraw[] = [];
  for (const target of state.targets) {
    const burn = target.effects?.burn;
    if (burn && !targetCommandEffects.has(`cinderGospel.burn\0${burn.rootTriggerId}\0${target.id}`)) {
      draws.push(toDraw({
        id: `status:${target.id}:cinderGospel.burn:${burn.rootTriggerId}`,
        artifactId: "cinderGospel",
        effectId: "cinderGospel.burn",
        rootTriggerId: burn.rootTriggerId,
        ...(burn.lineageId ? { lineageId: burn.lineageId } : {}),
        asset: "burnMark",
        bornAt: state.time,
        expiresAt: burn.nextTickAt + Math.max(0, burn.remainingTicks - 1) * 0.4,
        geometry: { type: "sprite", x: target.x, y: target.y, size: target.radius * 2.8, rotation: 0 },
      }, state.time, reducedMotion));
    }
    const charge = target.effects?.hollowPoint;
    if (charge) draws.push(toDraw({
      id: `status:${target.id}:hollowPoint.charge:${charge.rootTriggerId}`,
      artifactId: "hollowPoint",
      effectId: "hollowPoint.charge",
      rootTriggerId: charge.rootTriggerId,
      ...(charge.lineageId ? { lineageId: charge.lineageId } : {}),
      asset: "hollowExplosion",
      layer: "target-cues",
      bornAt: state.time,
      expiresAt: charge.expiresAt,
      geometry: { type: "disc", x: target.x, y: target.y, radius: target.radius * 1.25 },
    }, state.time, reducedMotion));
  }
  if (state.wantedBrand && state.wantedBrand.expiresAt > state.time) {
    const target = state.targets.find(({ id }) => id === state.wantedBrand!.targetId);
    if (target) draws.push(toDraw({
      id: `status:${target.id}:wantedBrand.mark:${state.wantedBrand.rootTriggerId}`,
      artifactId: "wantedBrand",
      effectId: state.wantedBrand.effectId,
      rootTriggerId: state.wantedBrand.rootTriggerId,
      ...(state.wantedBrand.lineageId ? { lineageId: state.wantedBrand.lineageId } : {}),
      asset: "wantedMark",
      bornAt: state.wantedBrand.markedAt,
      expiresAt: state.wantedBrand.expiresAt,
      geometry: { type: "sprite", x: target.x, y: target.y, size: target.radius * 3, rotation: 0 },
    }, state.time, reducedMotion));
  }
  return draws;
};

const projectCompanions = (state: GameState, reducedMotion: boolean): EffectDraw[] => {
  const draws = state.satellites
    .filter(({ bornAt, expiresAt }) => bornAt <= state.time && expiresAt > state.time)
    .map((satellite) => toDraw({
    id: `satellite:${satellite.id}`,
    artifactId: "ghostPosse",
    effectId: "ghostPosse.satellite",
    rootTriggerId: satellite.rootTriggerId,
    asset: "ghostSatellite",
    bornAt: satellite.bornAt,
    expiresAt: satellite.expiresAt,
    geometry: { type: "sprite", x: satellite.x, y: satellite.y, size: 34, rotation: satellite.phase },
  }, state.time, reducedMotion));
  for (const orbital of state.locketOrbitals) {
    if (orbital.bornAt > state.time || orbital.expiresAt <= state.time) continue;
    draws.push(toDraw({
      id: `orbital:${orbital.id}`,
      artifactId: "lastGaspLocket",
      effectId: "lastGaspLocket.orbital",
      rootTriggerId: orbital.rootTriggerId,
      lineageId: orbital.lineageId,
      asset: "locketOrbital",
      bornAt: orbital.bornAt,
      expiresAt: orbital.expiresAt,
      geometry: {
        type: "sprite",
        x: state.player.x + Math.cos(orbital.angle) * orbital.radius,
        y: state.player.y + Math.sin(orbital.angle) * orbital.radius,
        size: Math.max(28, orbital.hitRadius * 2),
        rotation: orbital.angle,
      },
    }, state.time, reducedMotion));
  }
  if (state.decoy && state.decoy.expiresAt > state.time) draws.push(toDraw({
    id: "decoy:undertakersCoat",
    artifactId: "undertakersCoat",
    effectId: "undertakersCoat.decoy",
    rootTriggerId: "player",
    asset: "coatDecoy",
    bornAt: state.decoy.expiresAt - 1,
    expiresAt: state.decoy.expiresAt,
    geometry: { type: "sprite", x: state.decoy.x, y: state.decoy.y, size: 62, rotation: 0 },
  }, state.time, reducedMotion));
  return draws;
};

export function projectEffectDraws(state: GameState, reducedMotion: boolean): readonly EffectDraw[] {
  return [
    ...projectCommands(state, reducedMotion),
    ...projectAreas(state, reducedMotion),
    ...projectTargetStatuses(state, reducedMotion),
    ...projectLinks(state, reducedMotion),
    ...projectProjectiles(state, reducedMotion),
    ...projectCompanions(state, reducedMotion),
  ].sort((a, b) => layerOrder[a.layer] - layerOrder[b.layer] || a.id.localeCompare(b.id));
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled effect draw variant: ${JSON.stringify(value)}`);
}
