import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type ExtensionManifest = {
  readonly minimum_chrome_version?: string;
  readonly background?: {
    readonly service_worker?: string;
    readonly type?: string;
  };
};

describe("extension runtime manifest", () => {
  it("registers the bundled background worker as an ES module", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../../../config/manifest.json", import.meta.url),
        "utf8",
      ),
    ) as ExtensionManifest;

    expect(manifest.background).toEqual({
      service_worker: "background.js",
      type: "module",
    });
    expect(Number(manifest.minimum_chrome_version)).toBeGreaterThanOrEqual(120);
  });
});
