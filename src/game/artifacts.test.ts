import { describe, expect, test } from "bun:test";
import {
  ARTIFACT_CATALOG,
  getOwnedArtifacts,
  validateArtifactCatalog,
  type ArtifactDefinition,
} from "./artifacts";
import { compileCombatBuild } from "./combat-build";
import { buildShot, deriveWeapon } from "./weapon";

const IDS = [
  "twinChamber", "deadeye", "lastBell", "graveEcho", "fanThePhantom", "dealersCut",
  "haloChamber", "ghostSight", "pinball", "wailingLead", "undertakersReturn", "cometSpur",
  "shotgun", "hollowPoint", "boneOrchard", "graveBloom", "soulHarvester", "bootlegMint",
  "coldcaster", "cinderGospel", "wantedBrand", "widowsLedger", "ectoplasmSnare", "hexBell",
  "spectralBullets", "teslaBullets", "bigIron", "ghostPosse", "ectoplasmicWake", "crossfireCovenant",
  "recoilBoots", "stillwater", "dustlineDuel", "bonanzaClip", "lastGaspLocket", "undertakersCoat",
] as const;

describe("artifact catalog", () => {
  test("is the exact complete six-by-six signature grid", () => {
    expect(ARTIFACT_CATALOG.map(({ id }) => id)).toEqual([...IDS]);
    expect(ARTIFACT_CATALOG).toHaveLength(36);
    expect(new Set(ARTIFACT_CATALOG.map(({ id }) => id)).size).toBe(36);
    expect(new Set(ARTIFACT_CATALOG.map(({ grid }) => `${grid.row}:${grid.column}`)).size).toBe(36);
    expect(new Set(ARTIFACT_CATALOG.map(({ icon }) => icon)).size).toBe(36);
    for (let row = 1; row <= 6; row += 1) {
      expect(ARTIFACT_CATALOG.filter((item) => item.grid.row === row)).toHaveLength(6);
    }
    expect(validateArtifactCatalog(ARTIFACT_CATALOG)).toEqual([]);
  });

  test("maps catalog rows to families", () => {
    const families = ["trigger", "motion", "impact", "status", "relation", "reactive"] as const;
    for (const artifact of ARTIFACT_CATALOG) expect(artifact.family).toBe(families[artifact.grid.row - 1]!);
  });

  test("every synergy points at a live artifact", () => {
    const ids = new Set(ARTIFACT_CATALOG.map(({ id }) => id));
    for (const artifact of ARTIFACT_CATALOG) {
      expect(artifact.synergies).toHaveLength(3);
      expect(artifact.synergies.every((id) => ids.has(id))).toBe(true);
    }
  });

  test("ownership remains boolean, unique, and catalog ordered", () => {
    expect(getOwnedArtifacts({ teslaBullets: true }).map(({ id }) => id)).toEqual(["teslaBullets"]);
    expect(getOwnedArtifacts({ shotgun: true, twinChamber: true }).map(({ id }) => id))
      .toEqual(["twinChamber", "shotgun"]);
    expect(() => getOwnedArtifacts({ teslaBullets: 2 } as never)).toThrow("teslaBullets must be true when present");
  });

  test("rejects invalid catalog metadata and rules", () => {
    const invalid = [{
      ...ARTIFACT_CATALOG[0],
      icon: "not-a-real-asset",
      synergies: ["missing", "shotgun", "teslaBullets"],
      rules: [{ ...ARTIFACT_CATALOG[0].rules[0]!, damageScale: Number.NaN }],
    }] as unknown as readonly ArtifactDefinition[];
    const errors = validateArtifactCatalog(invalid);
    expect(errors).toContain("artifact catalog must contain exactly 36 definitions");
    expect(errors).toContain("artifact twinChamber icon not-a-real-asset is not registered in ASSET_PATHS");
    expect(errors).toContain("artifact twinChamber synergy missing is not in the catalog");
    expect(errors.some((error) => error.includes("must contain only finite numeric parameters"))).toBe(true);
  });

  test("rejects missing or unknown IDs, out-of-grid positions, and out-of-range payloads", () => {
    const malformed = ARTIFACT_CATALOG.map((artifact, index) => index === 0
      ? { ...artifact, id: "counterfeit", grid: { row: 7, column: 1 } }
      : artifact) as unknown as readonly ArtifactDefinition[];
    const malformedErrors = validateArtifactCatalog(malformed);
    expect(malformedErrors).toContain("artifact catalog is missing id: twinChamber");
    expect(malformedErrors).toContain("artifact catalog has unknown id: counterfeit");
    expect(malformedErrors).toContain("artifact counterfeit grid position 7:1 is outside the six-by-six grid");

    const invalidChance = ARTIFACT_CATALOG.map((artifact) => artifact.id === "teslaBullets"
      ? { ...artifact, rules: artifact.rules.map((rule) => rule.kind === "fractionalMultishot" ? { ...rule, chance: 2 } : rule) }
      : artifact) as unknown as readonly ArtifactDefinition[];
    expect(validateArtifactCatalog(invalidChance)).toContain(
      "artifact teslaBullets rule teslaBullets.multishot.chance must be in (0, 1]",
    );
  });
});

describe("trigger-owned multishot", () => {
  const weapon = (loadout: Parameters<typeof compileCombatBuild>[0]) => deriveWeapon(compileCombatBuild(loadout), 0);

  test("Tesla remains neutral until the trigger reducer owns its single roll", () => {
    const tesla = weapon({ teslaBullets: true });
    expect(tesla.multishot).toBe(1);
    expect(tesla.spread).toBe(0);
    expect(buildShot(tesla, 0, () => 0.329, "trigger-a").projectiles).toHaveLength(1);
  });

  test("Twin Chamber and Tesla cannot arrange the legacy buildShot path", () => {
    const combined = weapon({ twinChamber: true, teslaBullets: true });
    expect(combined.multishot).toBe(1);
    expect(combined.spread).toBe(0);
    expect(buildShot(combined, 0, () => 0.2, "trigger-a").projectiles.map(({ heading }) => heading)).toEqual([0]);
  });
});
