import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt";
const SOURCE_SHA256 =
  "addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e";
const EXPECTED_ENTRY_COUNT = 7_775;
const LIST_DECLARATION = "export const GENERATED_USERNAME_WORDS = [";
const TARGET_PATH = fileURLToPath(
  new URL(
    "../src/lib/generate-username/generated-username.const.ts",
    import.meta.url,
  ),
);

const checkOnly = process.argv.slice(2).includes("--check");
const sourceBytes = await downloadSource();
verifySourceHash(sourceBytes);

const words = transformSource(sourceBytes.toString("utf8"));

if (words.length !== EXPECTED_ENTRY_COUNT) {
  throw new Error(
    `Expected ${EXPECTED_ENTRY_COUNT} transformed username words, received ${words.length}.`,
  );
}

const currentModule = await readFile(TARGET_PATH, "utf8");
const generatedModule = replaceGeneratedList(currentModule, words);

if (checkOnly) {
  if (generatedModule !== currentModule) {
    throw new Error(
      "The username word list is stale. Run pnpm core:generate-username-words.",
    );
  }

  console.info("The username word list matches its pinned source.");
} else {
  await writeFile(TARGET_PATH, generatedModule);
  console.info(`Generated ${words.length} username-word entries.`);
}

async function downloadSource() {
  const response = await fetch(SOURCE_URL);

  if (!response.ok) {
    throw new Error(
      `Unable to download the username-word source: HTTP ${response.status}.`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

function verifySourceHash(sourceBytes) {
  const actualHash = createHash("sha256").update(sourceBytes).digest("hex");

  if (actualHash !== SOURCE_SHA256) {
    throw new Error(
      `Username-word source SHA-256 mismatch: expected ${SOURCE_SHA256}, received ${actualHash}.`,
    );
  }
}

function transformSource(source) {
  const retainedWords = [];
  const normalizedWords = new Set();

  for (const line of source.split(/\r?\n/u)) {
    if (line.length === 0) {
      continue;
    }

    const match = /^\d{5}\t(.+)$/u.exec(line);

    if (match === null) {
      throw new Error(`Invalid EFF username-word source line: ${line}`);
    }

    const word = match[1].normalize("NFC").toLowerCase();
    const normalizedWord = word.replaceAll(/[^a-z0-9]/g, "");

    if (normalizedWord.length === 0 || normalizedWords.has(normalizedWord)) {
      continue;
    }

    normalizedWords.add(normalizedWord);
    retainedWords.push(word);
  }

  return retainedWords;
}

function replaceGeneratedList(currentModule, words) {
  const declarationStart = currentModule.indexOf(LIST_DECLARATION);

  if (declarationStart === -1) {
    throw new Error("Username word-list declaration was not found.");
  }

  const declarationEnd = currentModule.indexOf(
    "\n] as const;",
    declarationStart,
  );

  if (declarationEnd === -1) {
    throw new Error("Username word-list terminator was not found.");
  }

  const generatedList = `${LIST_DECLARATION}\n${words
    .map((word) => `  ${JSON.stringify(word)},`)
    .join("\n")}\n] as const;`;

  return `${currentModule.slice(0, declarationStart)}${generatedList}${currentModule.slice(declarationEnd + 12)}`;
}
