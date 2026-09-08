import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type ExtensionManifest = {
  readonly minimum_chrome_version?: string;
  readonly permissions?: readonly string[];
  readonly background?: {
    readonly scripts?: readonly string[];
    readonly service_worker?: string;
    readonly type?: string;
  };
  readonly browser_specific_settings?: {
    readonly gecko?: {
      readonly id?: string;
      readonly strict_min_version?: string;
      readonly data_collection_permissions?: {
        readonly required?: readonly string[];
      };
    };
  };
};

function readManifest(fileName: string): ExtensionManifest {
  return JSON.parse(
    readFileSync(
      new URL(`../../../config/${fileName}`, import.meta.url),
      "utf8",
    ),
  ) as ExtensionManifest;
}

describe("extension runtime manifest", () => {
  it("registers the bundled background worker as an ES module", () => {
    const manifest = readManifest("manifest.json");

    expect(manifest.background).toEqual({
      service_worker: "background.js",
      type: "module",
    });
    expect(Number(manifest.minimum_chrome_version)).toBeGreaterThanOrEqual(120);
  });

  it("registers the Firefox background document without Chrome offscreen access", () => {
    const manifest = readManifest("manifest.firefox.json");

    expect(manifest.background).toEqual({
      scripts: ["background.js"],
      type: "module",
    });
    expect(manifest.minimum_chrome_version).toBeUndefined();
    expect(manifest.permissions).not.toContain("offscreen");
    expect(manifest.browser_specific_settings?.gecko).toMatchObject({
      id: "lfspm@engr-serverless-pm.local",
      strict_min_version: "140.0",
      data_collection_permissions: {
        required: ["authenticationInfo"],
      },
    });
  });
});
