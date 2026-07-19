import { ASSET_PATHS, type AssetKey } from "../assets";
import type { ArtifactRule } from "./combat-build";

const degrees = Math.PI / 180;

export const ARTIFACT_IDS = [
  "twinChamber", "deadeye", "lastBell", "graveEcho", "fanThePhantom", "dealersCut",
  "haloChamber", "ghostSight", "pinball", "wailingLead", "undertakersReturn", "cometSpur",
  "shotgun", "hollowPoint", "boneOrchard", "graveBloom", "soulHarvester", "bootlegMint",
  "coldcaster", "cinderGospel", "wantedBrand", "widowsLedger", "ectoplasmSnare", "hexBell",
  "spectralBullets", "teslaBullets", "bigIron", "ghostPosse", "ectoplasmicWake", "crossfireCovenant",
  "recoilBoots", "stillwater", "dustlineDuel", "bonanzaClip", "lastGaspLocket", "undertakersCoat",
] as const;

export type ArtifactId = (typeof ARTIFACT_IDS)[number];
export type ArtifactLoadout = Partial<Record<ArtifactId, true>>;
export type ArtifactFamily = "trigger" | "motion" | "impact" | "status" | "relation" | "reactive";
type GridCoordinate = 1 | 2 | 3 | 4 | 5 | 6;

export type ArtifactDefinition = Readonly<{
  id: string;
  name: string;
  description: string;
  icon: AssetKey;
  family: ArtifactFamily;
  grid: Readonly<{ row: GridCoordinate; column: GridCoordinate }>;
  tags: readonly string[];
  synergies: readonly [string, string, string];
  rules: readonly ArtifactRule[];
}>;

export const ARTIFACT_CATALOG = [
  {
    id: "twinChamber", name: "Twin Chamber",
    description: "Fires a 70%-damage woven pair that separates by 18 px and reconverges within 96–480 px.",
    icon: "twinChamber", family: "trigger", grid: { row: 1, column: 1 }, tags: ["multishot", "converge"],
    synergies: ["teslaBullets", "crossfireCovenant", "shotgun"],
    rules: [
      { family: "trigger", kind: "twin", artifactId: "twinChamber", effectId: "twinChamber.pair", phase: 10, damageScale: 0.7, convergenceMin: 96, convergenceMax: 480, lateralOffset: 18 },
      { family: "motion", kind: "converge", artifactId: "twinChamber", effectId: "twinChamber.converge", phase: 30, minDistance: 96, maxDistance: 480, lateralOffset: 18 },
    ],
  },
  {
    id: "deadeye", name: "Deadeye",
    description: "A 12% active-reload window grants +20% fire rate for 2.25 s and six 35%-damage echo rounds.",
    icon: "deadeye", family: "trigger", grid: { row: 1, column: 2 }, tags: ["reload", "echo"],
    synergies: ["graveEcho", "lastBell", "teslaBullets"],
    rules: [{ family: "trigger", kind: "activeReload", artifactId: "deadeye", effectId: "deadeye.activeReload", phase: 5, window: 0.12, buff: 0.2, duration: 2.25, echoDelay: 0.12, echoDamageScale: 0.35 }],
  },
  {
    id: "lastBell", name: "Last Bell",
    description: "The last round becomes a slow, large 150%-damage bell that emits three damage rings.",
    icon: "lastBell", family: "trigger", grid: { row: 1, column: 3 }, tags: ["last-round", "pulse"],
    synergies: ["haloChamber", "ghostSight", "hollowPoint"],
    rules: [
      { family: "trigger", kind: "lastRound", artifactId: "lastBell", effectId: "lastBell.round", phase: 50, speedScale: 0.45, radiusScale: 1.6, damageScale: 1.5, pulseInterval: 0.25, pulseCount: 3 },
      { family: "emission", kind: "pulseRing", artifactId: "lastBell", effectId: "lastBell.rings", phase: 20, interval: 0.25, count: 3, radius: 44, damageScale: 0.25 },
    ],
  },
  {
    id: "graveEcho", name: "Grave Echo",
    description: "Repeats every generation-zero projectile after 0.28 s at 40% damage.",
    icon: "graveEcho", family: "trigger", grid: { row: 1, column: 4 }, tags: ["echo", "delayed"],
    synergies: ["teslaBullets", "haloChamber", "shotgun"],
    rules: [
      { family: "trigger", kind: "delayedVolley", artifactId: "graveEcho", effectId: "graveEcho.volley", phase: 90, delay: 0.28, damageScale: 0.4 },
      { family: "emission", kind: "echo", artifactId: "graveEcho", effectId: "graveEcho.echo", phase: 10, delay: 0.28, damageScale: 0.4 },
    ],
  },
  {
    id: "fanThePhantom", name: "Fan the Phantom",
    description: "Schedules three 45%-damage volleys at 0, 0.09, and 0.18 s around −8°, 0°, and +8°.",
    icon: "fanThePhantom", family: "trigger", grid: { row: 1, column: 5 }, tags: ["burst", "volley"],
    synergies: ["coldcaster", "ghostSight", "teslaBullets"],
    rules: [{ family: "trigger", kind: "fan", artifactId: "fanThePhantom", effectId: "fanThePhantom.fan", phase: 20, delays: [0, 0.09, 0.18], centers: [-8 * degrees, 0, 8 * degrees], damageScale: 0.45 }],
  },
  {
    id: "dealersCut", name: "Dealer's Cut",
    description: "Every third root trigger adds two 55%-damage side shots at ±35°.",
    icon: "dealersCut", family: "trigger", grid: { row: 1, column: 6 }, tags: ["cadence", "side-shot"],
    synergies: ["teslaBullets", "shotgun", "pinball"],
    rules: [{ family: "trigger", kind: "numberedSidePair", artifactId: "dealersCut", effectId: "dealersCut.sidePair", phase: 30, cadence: 3, angle: 35 * degrees, damageScale: 0.55 }],
  },
  {
    id: "haloChamber", name: "Halo Chamber",
    description: "Projectiles spiral from a 24 px radius, growing outward at 48 px/s and rotating at 3π rad/s for up to 4 s.",
    icon: "haloChamber", family: "motion", grid: { row: 2, column: 1 }, tags: ["spiral", "orbit"],
    synergies: ["teslaBullets", "shotgun", "ghostSight"],
    rules: [{ family: "motion", kind: "spiral", artifactId: "haloChamber", effectId: "haloChamber.spiral", phase: 20, initialRadius: 24, radialSpeed: 48, angularSpeed: 3 * Math.PI, lifetime: 4 }],
  },
  {
    id: "ghostSight", name: "Ghost Sight",
    description: "Acquires the closest target within 96 px and steers at up to 3π rad/s.",
    icon: "ghostSight", family: "motion", grid: { row: 2, column: 2 }, tags: ["homing", "targeting"],
    synergies: ["shotgun", "undertakersReturn", "wantedBrand"],
    rules: [{ family: "motion", kind: "homing", artifactId: "ghostSight", effectId: "ghostSight.homing", phase: 70, radius: 96, turnRate: 3 * Math.PI }],
  },
  {
    id: "pinball", name: "Pinball",
    description: "Adds one 90%-retention bounce; the first bounce accelerates 1.35× and relays toward a target within 160 px.",
    icon: "pinball", family: "motion", grid: { row: 2, column: 3 }, tags: ["bounce", "relay"],
    synergies: ["bootlegMint", "teslaBullets", "ghostSight"],
    rules: [
      { family: "impact", kind: "bounce", artifactId: "pinball", effectId: "pinball.bounce", phase: 10, count: 1, retention: 0.9 },
      { family: "motion", kind: "relay", artifactId: "pinball", effectId: "pinball.relay", phase: 70, speedScale: 1.35, radius: 160, turnRate: 3 * Math.PI },
    ],
  },
  {
    id: "wailingLead", name: "Wailing Lead",
    description: "Follows a swept sine path with 22 px amplitude and 144 px wavelength.",
    icon: "wailingLead", family: "motion", grid: { row: 2, column: 4 }, tags: ["wave", "swept"],
    synergies: ["teslaBullets", "spectralBullets", "ectoplasmicWake"],
    rules: [{ family: "motion", kind: "wave", artifactId: "wailingLead", effectId: "wailingLead.wave", phase: 40, amplitude: 22, wavelength: 144 }],
  },
  {
    id: "undertakersReturn", name: "Undertaker's Return",
    description: "Returns after 240 px with another 240 px path budget and 65% remaining damage.",
    icon: "undertakersReturn", family: "motion", grid: { row: 2, column: 5 }, tags: ["return", "boomerang"],
    synergies: ["spectralBullets", "coldcaster", "ectoplasmicWake"],
    rules: [{ family: "motion", kind: "return", artifactId: "undertakersReturn", effectId: "undertakersReturn.return", phase: 60, outbound: 240, inbound: 240, damageScale: 0.65 }],
  },
  {
    id: "cometSpur", name: "Comet Spur",
    description: "Over 1 s, grows speed and radius to 1.5× and damage to 1.35×.",
    icon: "cometSpur", family: "motion", grid: { row: 2, column: 6 }, tags: ["growth", "comet"],
    synergies: ["bigIron", "ghostSight", "hollowPoint"],
    rules: [{ family: "motion", kind: "comet", artifactId: "cometSpur", effectId: "cometSpur.comet", phase: 50, duration: 1, speedScale: 1.5, radiusScale: 1.5, damageScale: 1.35 }],
  },
  {
    id: "shotgun", name: "Shotgun",
    description: "At 160 px, splits into eight 25%-damage, 55%-radius pellets across 48° with 320 px range.",
    icon: "shotgun", family: "impact", grid: { row: 3, column: 1 }, tags: ["split", "cone"],
    synergies: ["teslaBullets", "ghostSight", "haloChamber"],
    rules: [{ family: "emission", kind: "splitCone", artifactId: "shotgun", effectId: "shotgun.split", phase: 30, distance: 160, count: 8, range: 320, angle: 48 * Math.PI / 180, damageScale: 0.25, radiusScale: 0.55 }],
  },
  {
    id: "hollowPoint", name: "Hollow Point",
    description: "Embeds a 60%-damage charge for 2 s; the next direct hit detonates it in a 64 px explosion.",
    icon: "hollowPoint", family: "impact", grid: { row: 3, column: 2 }, tags: ["charge", "explosion"],
    synergies: ["twinChamber", "fanThePhantom", "cometSpur"],
    rules: [
      { family: "impact", kind: "embeddedCharge", artifactId: "hollowPoint", effectId: "hollowPoint.charge", phase: 20, storedDamageScale: 0.6, duration: 2 },
      { family: "area", kind: "explosion", artifactId: "hollowPoint", effectId: "hollowPoint.explosion", phase: 20, radius: 64, damageScale: 1 },
    ],
  },
  {
    id: "boneOrchard", name: "Bone Orchard",
    description: "The first lineage hit emits three 20%-damage shards over ±18°, with 55% radius and 160 px range.",
    icon: "boneOrchard", family: "impact", grid: { row: 3, column: 3 }, tags: ["impact", "shards"],
    synergies: ["teslaBullets", "coldcaster", "spectralBullets"],
    rules: [{ family: "emission", kind: "forwardShards", artifactId: "boneOrchard", effectId: "boneOrchard.shards", phase: 40, count: 3, angle: 18 * degrees, range: 160, damageScale: 0.2, radiusScale: 0.55 }],
  },
  {
    id: "graveBloom", name: "Grave Bloom",
    description: "Natural expiry emits six radial spirits at 18% damage, 45% radius, and 128 px range.",
    icon: "graveBloom", family: "impact", grid: { row: 3, column: 4 }, tags: ["expiry", "radial"],
    synergies: ["haloChamber", "teslaBullets", "ghostSight"],
    rules: [{ family: "emission", kind: "expiryRadial", artifactId: "graveBloom", effectId: "graveBloom.expiry", phase: 50, count: 6, range: 128, damageScale: 0.18, radiusScale: 0.45 }],
  },
  {
    id: "soulHarvester", name: "Soul Harvester",
    description: "The first kill per root emits two 35%-origin-power spirits that seek distinct targets within 240 px.",
    icon: "soulHarvester", family: "impact", grid: { row: 3, column: 5 }, tags: ["kill", "spirits"],
    synergies: ["wantedBrand", "teslaBullets", "bonanzaClip"],
    rules: [{ family: "emission", kind: "killSpirits", artifactId: "soulHarvester", effectId: "soulHarvester.spirits", phase: 60, count: 2, radius: 240, damageScale: 0.35, turnRate: 3 * Math.PI }],
  },
  {
    id: "bootlegMint", name: "Bootleg Mint",
    description: "The first bounce mints one ±90° tangent copy at 30% damage, 55% radius, and 160 px range.",
    icon: "bootlegMint", family: "impact", grid: { row: 3, column: 6 }, tags: ["bounce", "copy"],
    synergies: ["pinball", "teslaBullets", "ghostSight"],
    rules: [{ family: "emission", kind: "tangentCopy", artifactId: "bootlegMint", effectId: "bootlegMint.copy", phase: 70, angle: 90 * degrees, range: 160, damageScale: 0.3, radiusScale: 0.55 }],
  },
  {
    id: "coldcaster", name: "Coldcaster",
    description: "Three chill stacks within 2 s freeze for 1.05 s; a generation-zero hit shatters into four ice shards.",
    icon: "coldcaster", family: "status", grid: { row: 4, column: 1 }, tags: ["chill", "freeze"],
    synergies: ["shotgun", "fanThePhantom", "undertakersReturn"],
    rules: [
      { family: "impact", kind: "chill", artifactId: "coldcaster", effectId: "coldcaster.chill", phase: 30, stacks: 3, stackDuration: 2, freezeDuration: 1.05 },
      { family: "emission", kind: "shatter", artifactId: "coldcaster", effectId: "coldcaster.shatter", phase: 80, count: 4, range: 128, damageScale: 0.15, radiusScale: 0.45 },
    ],
  },
  {
    id: "cinderGospel", name: "Cinder Gospel",
    description: "Direct hits burn for four 10%-damage ticks every 0.4 s; the first burning kill emits a 64 px ember ring.",
    icon: "cinderGospel", family: "status", grid: { row: 4, column: 2 }, tags: ["burn", "kill-reaction"],
    synergies: ["shotgun", "hexBell", "ectoplasmSnare"],
    rules: [
      { family: "impact", kind: "burn", artifactId: "cinderGospel", effectId: "cinderGospel.burn", phase: 31, ticks: 4, interval: 0.4, damageScale: 0.1 },
      { family: "area", kind: "explosion", artifactId: "cinderGospel", effectId: "cinderGospel.emberRing", phase: 30, radius: 64, damageScale: 0.2 },
    ],
  },
  {
    id: "wantedBrand", name: "Wanted Brand",
    description: "Brands one target for 3 s, steers at 2π/3 rad/s, and jumps within 240 px on death.",
    icon: "wantedBrand", family: "status", grid: { row: 4, column: 3 }, tags: ["brand", "targeting"],
    synergies: ["ghostSight", "soulHarvester", "widowsLedger"],
    rules: [{ family: "impact", kind: "brand", artifactId: "wantedBrand", effectId: "wantedBrand.brand", phase: 32, duration: 3, steering: 2 * Math.PI / 3, jumpRadius: 240 }],
  },
  {
    id: "widowsLedger", name: "Widow's Ledger",
    description: "The fifth direct hit within 2 s fires a guaranteed line for 120% of that hit's damage.",
    icon: "widowsLedger", family: "status", grid: { row: 4, column: 4 }, tags: ["counter", "line"],
    synergies: ["twinChamber", "fanThePhantom", "shotgun"],
    rules: [{ family: "impact", kind: "hitCounter", artifactId: "widowsLedger", effectId: "widowsLedger.notches", phase: 33, hits: 5, duration: 2, damageScale: 1.2 }],
  },
  {
    id: "ectoplasmSnare", name: "Ectoplasm Snare",
    description: "The first root hit creates a 40 px pool for 1.5 s, ticking at 10 Hz for 4% damage and 50% slow.",
    icon: "ectoplasmSnare", family: "status", grid: { row: 4, column: 5 }, tags: ["pool", "slow"],
    synergies: ["hollowPoint", "cinderGospel", "haloChamber"],
    rules: [{ family: "impact", kind: "poolOnHit", artifactId: "ectoplasmSnare", effectId: "ectoplasmSnare.pool", phase: 34, radius: 40, duration: 1.5, tickRate: 10, damageScale: 0.04, slow: 0.5 }],
  },
  {
    id: "hexBell", name: "Hex Bell",
    description: "Every fourth hit emits an 80 px status pulse with a 60% slow for 1 s.",
    icon: "hexBell", family: "status", grid: { row: 4, column: 6 }, tags: ["status", "pulse"],
    synergies: ["coldcaster", "cinderGospel", "shotgun"],
    rules: [{ family: "impact", kind: "statusPulse", artifactId: "hexBell", effectId: "hexBell.pulse", phase: 35, cadence: 4, radius: 80, slow: 0.6, duration: 1 }],
  },
  {
    id: "spectralBullets", name: "Spectral Bullets",
    description: "Pierces obstacles and each target once while room walls remain solid.",
    icon: "spectralBullets", family: "relation", grid: { row: 5, column: 1 }, tags: ["penetration", "spectral"],
    synergies: ["undertakersReturn", "wailingLead", "graveBloom"],
    rules: [{ family: "impact", kind: "penetration", artifactId: "spectralBullets", effectId: "spectralBullets.penetration", phase: 10, obstacles: true, targets: true }],
  },
  {
    id: "teslaBullets", name: "Tesla Bullets",
    description: "Adds a 33% extra shot with 8° spread and two-neighbor links within 96 px for 25% damage.",
    icon: "teslaBullets", family: "relation", grid: { row: 5, column: 2 }, tags: ["multishot", "link"],
    synergies: ["twinChamber", "shotgun", "crossfireCovenant"],
    rules: [
      { family: "trigger", kind: "fractionalMultishot", artifactId: "teslaBullets", effectId: "teslaBullets.multishot", phase: 11, chance: 0.33, spread: 8 * degrees },
      { family: "area", kind: "projectileLink", artifactId: "teslaBullets", effectId: "teslaBullets.link", phase: 10, radius: 96, neighbors: 2, damageScale: 0.25, cooldown: 0.15 },
    ],
  },
  {
    id: "bigIron", name: "Big Iron",
    description: "Creates an 80%-speed heavy main at 125% radius and 120% damage with an orbiting moonlet.",
    icon: "bigIron", family: "relation", grid: { row: 5, column: 3 }, tags: ["heavy", "moonlet"],
    synergies: ["twinChamber", "cometSpur", "hollowPoint"],
    rules: [
      { family: "trigger", kind: "heavyMainAndMoonlet", artifactId: "bigIron", effectId: "bigIron.heavy", phase: 70, radiusScale: 1.25, damageScale: 1.2, speedScale: 0.8 },
      { family: "motion", kind: "orbit", artifactId: "bigIron", effectId: "bigIron.moonletOrbit", phase: 10, radius: 14, angularSpeed: 6 * Math.PI },
      { family: "area", kind: "explosion", artifactId: "bigIron", effectId: "bigIron.kineticExplosion", phase: 20, radius: 56, damageScale: 0.5 },
    ],
  },
  {
    id: "ghostPosse", name: "Ghost Posse",
    description: "Creates a 40 px player satellite for 3 s; up to six older satellites fire 20%-damage copies next trigger.",
    icon: "ghostPosse", family: "relation", grid: { row: 5, column: 4 }, tags: ["satellite", "orbit"],
    synergies: ["teslaBullets", "coldcaster", "deadeye"],
    rules: [{ family: "trigger", kind: "playerSatellite", artifactId: "ghostPosse", effectId: "ghostPosse.satellite", phase: 80, radius: 40, duration: 3, cap: 6, damageScale: 0.2 }],
  },
  {
    id: "ectoplasmicWake", name: "Ectoplasmic Wake",
    description: "Leaves an 8 px trail for 0.8 s, ticking at 10 Hz for 5% damage with a 0.2 s cooldown.",
    icon: "ectoplasmicWake", family: "relation", grid: { row: 5, column: 5 }, tags: ["trail", "area"],
    synergies: ["wailingLead", "haloChamber", "undertakersReturn"],
    rules: [{ family: "area", kind: "trail", artifactId: "ectoplasmicWake", effectId: "ectoplasmicWake.trail", phase: 40, width: 8, duration: 0.8, tickRate: 10, damageScale: 0.05, cooldown: 0.2 }],
  },
  {
    id: "crossfireCovenant", name: "Crossfire Covenant",
    description: "Crossing friendly paths create one 48 px X pulse for 25% of the lower projectile damage.",
    icon: "crossfireCovenant", family: "relation", grid: { row: 5, column: 6 }, tags: ["crossfire", "area"],
    synergies: ["twinChamber", "haloChamber", "teslaBullets"],
    rules: [{ family: "area", kind: "pathCross", artifactId: "crossfireCovenant", effectId: "crossfireCovenant.cross", phase: 50, length: 48, damageScale: 0.25, participationCap: 1 }],
  },
  {
    id: "recoilBoots", name: "Recoil Boots",
    description: "Each trigger adds a 55 px/s reverse impulse and a 0.35 s wall-refund window.",
    icon: "recoilBoots", family: "reactive", grid: { row: 6, column: 1 }, tags: ["recoil", "refund"],
    synergies: ["lastBell", "bonanzaClip", "deadeye"],
    rules: [{ family: "trigger", kind: "recoil", artifactId: "recoilBoots", effectId: "recoilBoots.recoil", phase: 40, impulse: 55, duration: 0.35 }],
  },
  {
    id: "stillwater", name: "Stillwater",
    description: "Standing below 1 px/s for 0.6 s charges a 160%-damage, 200%-radius penetrating trigger.",
    icon: "stillwater", family: "reactive", grid: { row: 6, column: 2 }, tags: ["stationary", "charge"],
    synergies: ["twinChamber", "hollowPoint", "shotgun"],
    rules: [{ family: "trigger", kind: "stationaryCharge", artifactId: "stillwater", effectId: "stillwater.charge", phase: 40, speedThreshold: 1, chargeTime: 0.6, damageScale: 1.6, radiusScale: 2 }],
  },
  {
    id: "dustlineDuel", name: "Dustline Duel",
    description: "At 192 px, becomes spectral and leaves an afterimage that fires after 0.12 s for 35% damage and 192 px range.",
    icon: "dustlineDuel", family: "reactive", grid: { row: 6, column: 3 }, tags: ["distance", "afterimage"],
    synergies: ["haloChamber", "undertakersReturn", "shotgun"],
    rules: [
      { family: "motion", kind: "distanceThreshold", artifactId: "dustlineDuel", effectId: "dustlineDuel.threshold", phase: 65, distance: 192 },
      { family: "emission", kind: "afterimage", artifactId: "dustlineDuel", effectId: "dustlineDuel.afterimage", phase: 90, delay: 0.12, range: 192, damageScale: 0.35 },
    ],
  },
  {
    id: "bonanzaClip", name: "Bonanza Clip",
    description: "The first kill per root returns one ordinary cartridge after 0.25 s.",
    icon: "bonanzaClip", family: "reactive", grid: { row: 6, column: 4 }, tags: ["kill", "ammo"],
    synergies: ["soulHarvester", "cinderGospel", "lastBell"],
    rules: [{ family: "trigger", kind: "ammoReturn", artifactId: "bonanzaClip", effectId: "bonanzaClip.refund", phase: 100, delivery: 0.25 }],
  },
  {
    id: "lastGaspLocket", name: "Last Gasp Locket",
    description: "At 40 HP or lower, every third trigger converts one shot into a 40 px orbital for 2.5 s, capped at three.",
    icon: "lastGaspLocket", family: "reactive", grid: { row: 6, column: 5 }, tags: ["low-health", "orbital"],
    synergies: ["bigIron", "teslaBullets", "ghostPosse"],
    rules: [{ family: "trigger", kind: "lowHealthOrbital", artifactId: "lastGaspLocket", effectId: "lastGaspLocket.orbital", phase: 60, healthThreshold: 40, cadence: 3, radius: 40, duration: 2.5, cap: 3 }],
  },
  {
    id: "undertakersCoat", name: "Undertaker's Coat",
    description: "Accepted contact damage leaves a 1 s decoy and extends invulnerability to 1 s.",
    icon: "undertakersCoat", family: "reactive", grid: { row: 6, column: 6 }, tags: ["hurt", "decoy"],
    synergies: ["ectoplasmSnare", "recoilBoots", "lastGaspLocket"],
    rules: [
      { family: "trigger", kind: "hurtDecoy", artifactId: "undertakersCoat", effectId: "undertakersCoat.hurt", phase: 110, duration: 1, invulnerability: 1 },
      { family: "area", kind: "decoyInfluence", artifactId: "undertakersCoat", effectId: "undertakersCoat.decoy", phase: 60, duration: 1 },
    ],
  },
] as const satisfies readonly ArtifactDefinition[];

const FAMILIES: readonly ArtifactFamily[] = ["trigger", "motion", "impact", "status", "relation", "reactive"];
const KNOWN_IDS = new Set<string>(ARTIFACT_IDS);
const INTEGER_RULE_FIELDS = new Set(["count", "pulseCount", "stacks", "ticks", "hits", "neighbors", "cadence", "cap", "participationCap"]);
const UNIT_RULE_FIELDS = new Set(["chance", "retention", "slow"]);

function containsNonFiniteNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsNonFiniteNumber);
}

function numericRuleEntries(value: unknown, path = ""): readonly [string, number][] {
  if (typeof value === "number") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => numericRuleEntries(child, path ? `${path}.${key}` : key));
}

export function validateArtifactCatalog(catalog: readonly ArtifactDefinition[]): string[] {
  const errors: string[] = [];
  if (catalog.length !== 36) errors.push("artifact catalog must contain exactly 36 definitions");
  const ids = new Set(catalog.map(({ id }) => id));
  for (const id of ARTIFACT_IDS) if (!ids.has(id)) errors.push(`artifact catalog is missing id: ${id}`);
  for (const id of ids) if (!KNOWN_IDS.has(id)) errors.push(`artifact catalog has unknown id: ${id}`);
  const seenIds = new Set<string>();
  const positions = new Set<string>();
  const icons = new Set<string>();
  const effectIds = new Set<string>();

  for (const definition of catalog) {
    if (!definition.id || seenIds.has(definition.id)) errors.push(`duplicate artifact id: ${definition.id}`);
    seenIds.add(definition.id);
    if (!definition.name || !definition.description || !definition.icon || definition.tags.length === 0) {
      errors.push(`artifact ${definition.id} must include display metadata`);
    }
    if (!Object.hasOwn(ASSET_PATHS, definition.icon)) {
      errors.push(`artifact ${definition.id} icon ${definition.icon} is not registered in ASSET_PATHS`);
    }
    if (icons.has(definition.icon)) errors.push(`duplicate artifact icon: ${definition.icon}`);
    icons.add(definition.icon);

    const position = `${definition.grid.row}:${definition.grid.column}`;
    if (!Number.isInteger(definition.grid.row) || definition.grid.row < 1 || definition.grid.row > 6
      || !Number.isInteger(definition.grid.column) || definition.grid.column < 1 || definition.grid.column > 6) {
      errors.push(`artifact ${definition.id} grid position ${position} is outside the six-by-six grid`);
    }
    if (positions.has(position)) errors.push(`duplicate artifact grid position: ${position}`);
    positions.add(position);
    if (FAMILIES[definition.grid.row - 1] !== definition.family) {
      errors.push(`artifact ${definition.id} family ${definition.family} does not match row ${definition.grid.row}`);
    }
    if (definition.synergies.length !== 3) errors.push(`artifact ${definition.id} must declare exactly three synergies`);
    for (const synergy of definition.synergies) {
      if (!ids.has(synergy)) errors.push(`artifact ${definition.id} synergy ${synergy} is not in the catalog`);
    }
    if (definition.rules.length === 0) errors.push(`artifact ${definition.id} must declare a behavioral rule`);
    for (const rule of definition.rules) {
      if (rule.artifactId !== definition.id || !rule.effectId || !Number.isInteger(rule.phase) || rule.phase < 0) {
        errors.push(`artifact ${definition.id} rule ${rule.effectId} has invalid provenance`);
      }
      if (effectIds.has(rule.effectId)) errors.push(`duplicate effectId: ${rule.effectId}`);
      effectIds.add(rule.effectId);
      if (containsNonFiniteNumber(rule)) errors.push(`artifact ${definition.id} rule ${rule.effectId} must contain only finite numeric parameters`);
      for (const [path, value] of numericRuleEntries(rule)) {
        if (!Number.isFinite(value)) continue;
        const field = path.split(".").at(-1)!;
        if (INTEGER_RULE_FIELDS.has(field) && (!Number.isInteger(value) || value <= 0)) {
          errors.push(`artifact ${definition.id} rule ${rule.effectId}.${path} must be a positive integer`);
        } else if (UNIT_RULE_FIELDS.has(field) && (value <= 0 || value > 1)) {
          errors.push(`artifact ${definition.id} rule ${rule.effectId}.${path} must be in (0, 1]`);
        }
      }
    }
  }
  return errors;
}

export function getOwnedArtifacts(loadout: ArtifactLoadout): readonly ArtifactDefinition[] {
  for (const [id, value] of Object.entries(loadout)) {
    if (value !== true) throw new Error(`${id} must be true when present`);
    if (!KNOWN_IDS.has(id)) throw new Error(`${id} is not a known artifact`);
  }
  return ARTIFACT_CATALOG.filter((definition) => loadout[definition.id] === true);
}
