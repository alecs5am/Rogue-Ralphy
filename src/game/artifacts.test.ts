import { describe, expect, test } from "bun:test";
import { ARTIFACT_CATALOG, getOwnedArtifacts, validateArtifactCatalog, type ArtifactDefinition } from "./artifacts";
import { buildShot, deriveWeapon } from "./weapon";

describe("artifact catalog", () => {
  test("contains unique definitions for the three new artifacts", () => {
    expect(validateArtifactCatalog(ARTIFACT_CATALOG)).toEqual([]);
    expect(ARTIFACT_CATALOG.filter(({ id }) => ["teslaBullets", "shotgun", "spectralBullets"].includes(id))).toHaveLength(3);
  });

  test("ownership remains boolean and unique", () => {
    expect(getOwnedArtifacts({ teslaBullets: true }).map(({ id }) => id)).toEqual(["teslaBullets"]);
    expect(() => getOwnedArtifacts({ teslaBullets: 2 } as never)).toThrow("teslaBullets must be true when present");
  });

  test("rejects artifact icons that are not registered asset keys", () => {
    const catalog = [{ ...ARTIFACT_CATALOG[0], icon: "not-a-real-asset" }] as unknown as readonly ArtifactDefinition[];
    expect(validateArtifactCatalog(catalog)).toContain(
      "artifact twinChamber icon not-a-real-asset is not registered in ASSET_PATHS",
    );
  });

  test("reports a useful validation error for an unknown runtime effect", () => {
    const catalog = [{
      ...ARTIFACT_CATALOG[0],
      effects: [{ kind: "teleport" }],
    }] as unknown as readonly ArtifactDefinition[];
    expect(validateArtifactCatalog(catalog)).toContain(
      "twinChamber.effects[0] has unknown effect kind: teleport",
    );
  });
});

describe("probabilistic multishot", () => {
  test("Tesla uses a fresh 33 percent roll with no accumulator", () => {
    const weapon = deriveWeapon({ teslaBullets: true }, 0);
    expect(weapon.multishot).toBeCloseTo(1.33);
    expect(buildShot(weapon, 0, () => 0.329, "trigger-a").projectiles).toHaveLength(2);
    expect(buildShot(weapon, 0, () => 0.33, "trigger-b").projectiles).toHaveLength(1);
    expect(buildShot(weapon, 0, () => 0.99, "trigger-c").projectiles).toHaveLength(1);
  });

  test("Twin Chamber and Tesla derive 2.33 multishot", () => {
    const weapon = deriveWeapon({ twinChamber: true, teslaBullets: true }, 0);
    expect(weapon.multishot).toBeCloseTo(2.33);
    expect(buildShot(weapon, 0, () => 0.2, "trigger-a").projectiles).toHaveLength(3);
    expect(buildShot(weapon, 0, () => 0.8, "trigger-b").projectiles).toHaveLength(2);
  });
});
