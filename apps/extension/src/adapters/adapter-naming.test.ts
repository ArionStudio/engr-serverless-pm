import { readdirSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { describe, expect, it } from "vitest";

const ADAPTER_ROOT = new URL("./", import.meta.url);
const CORE_PORT_ROOT = new URL(
  "../../../../packages/core/src/ports/",
  import.meta.url,
);

function collectProductionModules(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(entry.name, directory);

    if (entry.isDirectory()) {
      return collectProductionModules(new URL(`${entry.name}/`, directory));
    }

    if (
      extname(entry.name) !== ".ts" ||
      entry.name.endsWith(".test.ts") ||
      entry.name === "index.ts"
    ) {
      return [];
    }

    return [entryUrl];
  });
}

describe("adapter naming", () => {
  const productionModules = collectProductionModules(ADAPTER_ROOT);

  it("reserves port and repository module suffixes for contracts", () => {
    const invalidNames = productionModules
      .map(({ pathname }) => pathname)
      .filter(
        (pathname) =>
          pathname.endsWith(".port.ts") || pathname.endsWith(".repository.ts"),
      );

    expect(invalidNames).toEqual([]);
  });

  it("names concrete port implementations as adapters", () => {
    const invalidAdapters = productionModules.flatMap((moduleUrl) => {
      const source = readFileSync(moduleUrl, "utf8");
      const implementations = source.matchAll(
        /export class (\w+)\s+implements\s+\w+Port\b/g,
      );

      return [...implementations].flatMap(([, className]) => {
        const expectedStem = className
          ?.replace(/Adapter$/, "")
          .replaceAll(/[^a-zA-Z0-9]/g, "")
          .toLowerCase();
        const actualStem = basename(moduleUrl.pathname, ".adapter.ts")
          .replaceAll("-", "")
          .toLowerCase();

        if (
          className?.endsWith("Adapter") === true &&
          moduleUrl.pathname.endsWith(".adapter.ts") &&
          actualStem === expectedStem
        ) {
          return [];
        }

        return [`${moduleUrl.pathname}: ${className ?? "unnamed class"}`];
      });
    });

    expect(invalidAdapters).toEqual([]);
  });

  it("keeps adapter modules tied to a core port", () => {
    const invalidAdapterModules = productionModules
      .filter(({ pathname }) => pathname.endsWith(".adapter.ts"))
      .filter((moduleUrl) => {
        const source = readFileSync(moduleUrl, "utf8");

        return !/export class \w+Adapter\s+implements\s+\w+Port\b/.test(source);
      })
      .map(({ pathname }) => pathname);

    expect(invalidAdapterModules).toEqual([]);
  });
});

describe("core port naming", () => {
  const portModules = collectProductionModules(CORE_PORT_ROOT);

  it("keeps every port contract in a port module", () => {
    const invalidNames = portModules
      .map(({ pathname }) => pathname)
      .filter((pathname) => !pathname.endsWith(".port.ts"));

    expect(invalidNames).toEqual([]);
  });

  it("exports a Port interface from every port module", () => {
    const invalidPorts = portModules
      .filter((moduleUrl) => {
        const source = readFileSync(moduleUrl, "utf8");

        return !/export interface \w+Port\b/.test(source);
      })
      .map(({ pathname }) => pathname);

    expect(invalidPorts).toEqual([]);
  });
});
