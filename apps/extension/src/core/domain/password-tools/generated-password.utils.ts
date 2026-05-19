import type {
  GeneratedPasswordCharacterSets,
  GeneratedPasswordPickIndex,
  GeneratedPasswordSettings,
} from "./generated-password.type";
import {
  GENERATED_PASSWORD_FULL_CHARACTER_SETS,
  GENERATED_PASSWORD_UNMISTAKABLE_CHARACTER_SETS,
} from "./generated-password.const";

export function getGeneratedPasswordCharacterSets(
  settings: GeneratedPasswordSettings,
): GeneratedPasswordCharacterSets {
  const availableSets = settings.avoidAmbiguousCharacters
    ? GENERATED_PASSWORD_UNMISTAKABLE_CHARACTER_SETS
    : GENERATED_PASSWORD_FULL_CHARACTER_SETS;

  const enabledSets = [
    settings.uppercase ? availableSets.uppercase : "",
    settings.lowercase ? availableSets.lowercase : "",
    settings.numbers ? availableSets.numbers : "",
    settings.special ? availableSets.special : "",
  ];

  return {
    numbers: settings.numbers ? availableSets.numbers : "",
    special: settings.special ? availableSets.special : "",
    all: enabledSets.join(""),
  };
}

export function canGeneratePassword(
  settings: GeneratedPasswordSettings,
  characterSets: GeneratedPasswordCharacterSets,
): boolean {
  if (characterSets.all.length === 0) {
    return false;
  }

  if (settings.minNumbers > 0 && characterSets.numbers.length === 0) {
    return false;
  }

  if (settings.minSpecial > 0 && characterSets.special.length === 0) {
    return false;
  }

  return settings.minNumbers + settings.minSpecial <= settings.length;
}

export async function pickGeneratedPasswordCharacters(
  settings: GeneratedPasswordSettings,
  characterSets: GeneratedPasswordCharacterSets,
  pickIndex: GeneratedPasswordPickIndex,
): Promise<string[]> {
  const characters = [
    ...(await pickMany(characterSets.numbers, settings.minNumbers, pickIndex)),
    ...(await pickMany(characterSets.special, settings.minSpecial, pickIndex)),
  ];
  const remainingLength = settings.length - characters.length;

  characters.push(
    ...(await pickMany(characterSets.all, remainingLength, pickIndex)),
  );

  return characters;
}

export async function shuffleGeneratedPasswordCharacters(
  values: string[],
  pickIndex: GeneratedPasswordPickIndex,
): Promise<string[]> {
  const shuffled = [...values];

  // Required character groups are generated first, so we shuffle to avoid
  // leaking their positions. Fisher-Yates gives an unbiased permutation when
  // each swap index is selected uniformly:
  // https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const swapIndex = await pickIndex(i + 1);
    [shuffled[i], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[i]];
  }

  return shuffled;
}

async function pickMany(
  characterSet: string,
  count: number,
  pickIndex: GeneratedPasswordPickIndex,
): Promise<string[]> {
  const characters: string[] = [];

  for (let i = 0; i < count; i++) {
    characters.push(characterSet[await pickIndex(characterSet.length)]);
  }

  return characters;
}
