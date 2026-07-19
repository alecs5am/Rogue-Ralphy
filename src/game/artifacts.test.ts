import { describe, expect, test } from "bun:test";
import { ARTIFACT_CATALOG, getOwnedArtifacts, validateArtifactCatalog, type ArtifactDefinition } from "./artifacts";
import { buildShot, deriveWeapon } from "./weapon";

const degrees = Math.PI / 180;

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

  test("rejects invalid Shotgun cone and radius scales", () => {
    const shotgun = ARTIFACT_CATALOG.find(({ id }) => id === "shotgun")!;
    const invalid = (fanAngle: number, radiusScale: number) => [{
      ...shotgun,
      effects: [{ kind: "split", distance: 160, count: 8, childRange: 320,
        damageScale: 0.25, fanAngle, radiusScale }],
    }] as unknown as readonly ArtifactDefinition[];
    expect(validateArtifactCatalog(invalid(Math.PI * 2 + 0.01, 0.55))).toContain(
      "shotgun.effects[0].split parameters must be finite and positive",
    );
    expect(validateArtifactCatalog(invalid(Math.PI / 4, 1.01))).toContain(
      "shotgun.effects[0].split parameters must be finite and positive",
    );
  });
});

describe("probabilistic multishot", () => {
  test("Tesla uses a fresh 33 percent roll and fans a successful pair across eight degrees", () => {
    const weapon = deriveWeapon({ teslaBullets: true }, 0);
    expect(weapon.multishot).toBeCloseTo(1.33);
    expect(weapon.spread).toBeCloseTo(8 * degrees);

    const proc = buildShot(weapon, 0, () => 0.329, "trigger-a").projectiles;
    expect(proc).toHaveLength(2);
    expect(proc[0]!.heading).toBeCloseTo(-4 * degrees);
    expect(proc[1]!.heading).toBeCloseTo(4 * degrees);

    const miss = buildShot(weapon, 0, () => 0.33, "trigger-b").projectiles;
    expect(miss).toHaveLength(1);
    expect(miss[0]!.heading).toBe(0);
    expect(buildShot(weapon, 0, () => 0.99, "trigger-c").projectiles).toHaveLength(1);
  });

  test("Twin Chamber and Tesla add their multishot and spread", () => {
    const weapon = deriveWeapon({ twinChamber: true, teslaBullets: true }, 0);
    expect(weapon.multishot).toBeCloseTo(2.33);
    expect(weapon.spread).toBeCloseTo(16 * degrees);

    const proc = buildShot(weapon, 0, () => 0.2, "trigger-a").projectiles;
    expect(proc.map(({ heading }) => heading)).toHaveLength(3);
    expect(proc[0]!.heading).toBeCloseTo(-8 * degrees);
    expect(proc[1]!.heading).toBeCloseTo(0);
    expect(proc[2]!.heading).toBeCloseTo(8 * degrees);

    const miss = buildShot(weapon, 0, () => 0.8, "trigger-b").projectiles;
    expect(miss[0]!.heading).toBeCloseTo(-8 * degrees);
    expect(miss[1]!.heading).toBeCloseTo(8 * degrees);
  });
});
