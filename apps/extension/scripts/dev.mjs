import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build } from "vite";

const extensionDirectory = fileURLToPath(new URL("..", import.meta.url));
const browserTarget =
  process.env.LFSPM_BROWSER_TARGET === "firefox" ? "firefox" : "chromium";
const distributionDirectory = resolve(
  extensionDirectory,
  browserTarget === "firefox" ? "dist-firefox" : "dist",
);
const configFiles = ["vite.config.ts", "vite.content.config.ts"];
const watchers = [];
let closing = false;

async function closeWatchers(exitCode) {
  if (closing) return;
  closing = true;
  process.exitCode = exitCode;
  await Promise.allSettled(watchers.map((watcher) => watcher.close()));
}

function reportError(error) {
  console.error(error);
  void closeWatchers(1);
}

for (const [signal, exitCode] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(signal, () => void closeWatchers(exitCode));
}

try {
  await rm(distributionDirectory, { recursive: true, force: true });

  for (const configFile of configFiles) {
    const watcher = await build({
      configFile: resolve(extensionDirectory, "config", configFile),
      build: {
        emptyOutDir: false,
        watch: {},
      },
    });

    if (
      typeof watcher.on !== "function" ||
      typeof watcher.close !== "function"
    ) {
      throw new TypeError(`Vite did not create a watcher for ${configFile}`);
    }
    if (closing) {
      await watcher.close();
      break;
    }

    watchers.push(watcher);
    watcher.on("event", (event) => {
      if (event.code === "ERROR") reportError(event.error);
    });
  }
} catch (error) {
  reportError(error);
}
