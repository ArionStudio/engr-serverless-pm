import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const distributionDirectory = resolve("dist");
const manifestPath = resolve(distributionDirectory, ".vite/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const backgroundEntry = Object.values(manifest).find(
  (entry) =>
    entry.isEntry === true &&
    typeof entry.src === "string" &&
    entry.src.endsWith("/extension/background/background.ts"),
);

if (backgroundEntry === undefined) {
  throw new Error("Production bundle manifest has no background entry.");
}

const reachableChunkKeys = new Set();
const pendingChunkKeys = [backgroundEntry.src];

while (pendingChunkKeys.length > 0) {
  const chunkKey = pendingChunkKeys.pop();

  if (chunkKey === undefined || reachableChunkKeys.has(chunkKey)) {
    continue;
  }

  const chunk = manifest[chunkKey];

  if (chunk === undefined) {
    throw new Error(`Production bundle manifest is missing chunk ${chunkKey}.`);
  }

  reachableChunkKeys.add(chunkKey);
  pendingChunkKeys.push(
    ...(chunk.imports ?? []),
    ...(chunk.dynamicImports ?? []),
  );
}

for (const chunkKey of reachableChunkKeys) {
  const chunk = manifest[chunkKey];
  const source = readFileSync(
    resolve(distributionDirectory, chunk.file),
    "utf8",
  );

  if (source.includes("abandon")) {
    throw new Error(
      `BIP39 English wordlist leaked into background-reachable chunk ${chunk.file}.`,
    );
  }
}
