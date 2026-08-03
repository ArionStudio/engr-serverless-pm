import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://raw.githubusercontent.com/danielmiessler/SecLists/e5e49caa6fb648476f3bca391b26a45a4f5d3f13/Passwords/Common-Credentials/xato-net-10-million-passwords-10000.txt";
const SOURCE_SHA256 =
  "c63d5e4ccc31344d662583cc39ca4bd5bd20517ff1d24501f0c4e0c22d9b722a";
const EXPECTED_ENTRY_COUNT = 9_916;
const LIST_DECLARATION =
  "export const PASSWORD_STRENGTH_COMMON_PASSWORDS: readonly string[] = [";
const TARGET_PATH = fileURLToPath(
  new URL(
    "../src/lib/password-strength/password-strength.const.ts",
    import.meta.url,
  ),
);

const checkOnly = process.argv.slice(2).includes("--check");
const sourceBytes = await downloadSource();
verifySourceHash(sourceBytes);

const passwords = transformSource(sourceBytes.toString("utf8"));

if (passwords.length !== EXPECTED_ENTRY_COUNT) {
  throw new Error(
    `Expected ${EXPECTED_ENTRY_COUNT} transformed passwords, received ${passwords.length}.`,
  );
}

const currentModule = await readFile(TARGET_PATH, "utf8");
const generatedModule = replaceGeneratedList(currentModule, passwords);

if (checkOnly) {
  if (generatedModule !== currentModule) {
    throw new Error(
      "The common-password list is stale. Run pnpm core:generate-common-passwords.",
    );
  }

  console.info("The common-password list matches its pinned source.");
} else {
  await writeFile(TARGET_PATH, generatedModule);
  console.info(`Generated ${passwords.length} common-password entries.`);
}

async function downloadSource() {
  const response = await fetch(SOURCE_URL);

  if (!response.ok) {
    throw new Error(
      `Unable to download the common-password source: HTTP ${response.status}.`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

function verifySourceHash(sourceBytes) {
  const actualHash = createHash("sha256").update(sourceBytes).digest("hex");

  if (actualHash !== SOURCE_SHA256) {
    throw new Error(
      `Common-password source SHA-256 mismatch: expected ${SOURCE_SHA256}, received ${actualHash}.`,
    );
  }
}

function transformSource(source) {
  return [
    ...new Set(
      source
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((password) => password.normalize("NFC").toLowerCase()),
    ),
  ].sort();
}

function replaceGeneratedList(currentModule, passwords) {
  const declarationStart = currentModule.indexOf(LIST_DECLARATION);

  if (declarationStart === -1) {
    throw new Error("Common-password list declaration was not found.");
  }

  const declarationEnd = currentModule.indexOf("\n];", declarationStart);

  if (declarationEnd === -1) {
    throw new Error("Common-password list terminator was not found.");
  }

  const generatedList = `${LIST_DECLARATION}\n${passwords
    .map((password) => `  ${JSON.stringify(password)},`)
    .join("\n")}\n];`;

  return `${currentModule.slice(0, declarationStart)}${generatedList}${currentModule.slice(declarationEnd + 3)}`;
}
