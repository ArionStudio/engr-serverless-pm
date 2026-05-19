import {
  GENERATED_USERNAME_NUMBER_DIGITS,
  GENERATED_USERNAME_WORD_COUNT,
  GENERATED_USERNAME_WORDS,
} from "./generated-username.const";
import type {
  GeneratedUsernamePickIndex,
  GeneratedUsernameSettings,
} from "./generated-username.type";

export async function generateUsernameValue(
  settings: GeneratedUsernameSettings,
  pickIndex: GeneratedUsernamePickIndex,
): Promise<string> {
  const words: string[] = [];

  // Bitwarden has a first-class random-word username generator using the EFF
  // word list. We use two neutral words to keep usernames readable while giving
  // more combinations without storing user identity data in the generated value:
  // https://github.com/bitwarden/clients/blob/cdbe896d63c1f2fb73ce28356e705f5be7192aaf/libs/tools/generator/core/src/engine/username-randomizer.ts
  for (let i = 0; i < GENERATED_USERNAME_WORD_COUNT; i++) {
    const word =
      GENERATED_USERNAME_WORDS[
        await pickIndex(GENERATED_USERNAME_WORDS.length)
      ];
    words.push(settings.capitalize ? capitalizeWord(word) : word);
  }

  if (!settings.includeNumber) {
    return words.join("");
  }

  return `${words.join("")}${await generateUsernameNumber(pickIndex)}`;
}

async function generateUsernameNumber(
  pickIndex: GeneratedUsernamePickIndex,
): Promise<string> {
  const digits: string[] = [];

  for (let i = 0; i < GENERATED_USERNAME_NUMBER_DIGITS; i++) {
    digits.push(String(await pickIndex(10)));
  }

  return digits.join("");
}

function capitalizeWord(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}
