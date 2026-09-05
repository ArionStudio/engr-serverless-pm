import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.name.startsWith("_")) {
      throw new Error(
        `Chrome reserves filenames starting with "_": ${entryPath}`,
      );
    }
    if (entry.isDirectory()) checkDirectory(entryPath);
    if (entry.isFile() && entry.name.endsWith(".html")) {
      const html = readFileSync(entryPath, "utf8");
      if (/<link\b[^>]*\brel=["']modulepreload["']/i.test(html)) {
        throw new Error(
          `Extension HTML must not emit module preload hints: ${entryPath}`,
        );
      }
    }
  }
}

checkDirectory(resolve("dist"));
