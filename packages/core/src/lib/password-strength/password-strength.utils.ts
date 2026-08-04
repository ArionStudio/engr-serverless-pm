import {
  PASSWORD_STRENGTH_COMMON_PASSWORDS,
  PASSWORD_STRENGTH_DOMINANT_REPETITION_RATIO,
  PASSWORD_STRENGTH_DOMINANT_REPEATED_CHARACTER_RATIO,
  PASSWORD_STRENGTH_DOMINANT_SEQUENCE_RATIO,
  PASSWORD_STRENGTH_LENGTH_THRESHOLDS,
  PASSWORD_STRENGTH_MAX_REPEATED_UNIT_LENGTH,
  PASSWORD_STRENGTH_MINIMUM_MAX_SCORE_CHARACTER_CLASSES,
  PASSWORD_STRENGTH_MINIMUM_MAX_SCORE_UNIQUE_CHARACTERS,
  PASSWORD_STRENGTH_PREDICTABLE_SEQUENCES,
  PASSWORD_STRENGTH_SEQUENCE_MINIMUM_LENGTH,
} from "./password-strength.const";
import type {
  PasswordStrength,
  PasswordStrengthScore,
} from "./password-strength.type";

const COMMON_PASSWORD_VARIANT_SUFFIX_PATTERN = /[0-9\p{P}\p{S}]{1,8}$/u;

const COMMON_PASSWORD_LEET_SUBSTITUTIONS: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

export function calculatePasswordStrength(password: string): PasswordStrength {
  const normalizedPassword = password.normalize("NFC");
  const characters = [...normalizedPassword];
  const canonicalPassword = normalizedPassword.toLowerCase();
  const baseScore = scorePasswordLength(characters.length);

  if (characters.length === 0 || new Set(characters).size === 1) {
    return { score: 0 };
  }

  if (isCommonPassword(canonicalPassword)) {
    return { score: 0 };
  }

  if (
    isCommonPasswordVariant(canonicalPassword) ||
    hasDominantRepeatedPattern(characters) ||
    hasLowCharacterDiversity(characters) ||
    hasDominantRepeatedCharacters(characters) ||
    hasDominantPredictableSequence([...canonicalPassword])
  ) {
    return { score: baseScore === 0 ? 0 : 1 };
  }

  if (
    baseScore === 4 &&
    countCharacterClasses(characters) <
      PASSWORD_STRENGTH_MINIMUM_MAX_SCORE_CHARACTER_CLASSES
  ) {
    return { score: 3 };
  }

  return { score: baseScore };
}

function scorePasswordLength(length: number): PasswordStrengthScore {
  if (length < PASSWORD_STRENGTH_LENGTH_THRESHOLDS[0]) return 0;
  if (length < PASSWORD_STRENGTH_LENGTH_THRESHOLDS[1]) return 1;
  if (length < PASSWORD_STRENGTH_LENGTH_THRESHOLDS[2]) return 2;
  if (length < PASSWORD_STRENGTH_LENGTH_THRESHOLDS[3]) return 3;

  return 4;
}

function isCommonPassword(password: string): boolean {
  let start = 0;
  let end = PASSWORD_STRENGTH_COMMON_PASSWORDS.length - 1;

  while (start <= end) {
    const middle = start + Math.floor((end - start) / 2);
    const candidate = PASSWORD_STRENGTH_COMMON_PASSWORDS[middle];

    if (candidate === password) return true;

    if (candidate < password) {
      start = middle + 1;
    } else {
      end = middle - 1;
    }
  }

  return false;
}

function isCommonPasswordVariant(password: string): boolean {
  const withoutSuffix = password.replace(
    COMMON_PASSWORD_VARIANT_SUFFIX_PATTERN,
    "",
  );

  if (
    withoutSuffix.length > 0 &&
    withoutSuffix !== password &&
    isCommonPassword(withoutSuffix)
  ) {
    return true;
  }

  const simplifiedPassword = [...withoutSuffix]
    .map(
      (character) => COMMON_PASSWORD_LEET_SUBSTITUTIONS[character] ?? character,
    )
    .join("");

  return (
    simplifiedPassword.length > 0 &&
    simplifiedPassword !== password &&
    isCommonPassword(simplifiedPassword)
  );
}

function hasDominantRepeatedPattern(characters: string[]): boolean {
  const maximumUnitLength = Math.min(
    PASSWORD_STRENGTH_MAX_REPEATED_UNIT_LENGTH,
    Math.floor(characters.length / 2),
  );

  for (let unitLength = 1; unitLength <= maximumUnitLength; unitLength += 1) {
    let repeatedRegionLength = unitLength;

    for (let index = unitLength; index < characters.length; index += 1) {
      if (characters[index] === characters[index - unitLength]) {
        repeatedRegionLength += 1;
      } else {
        repeatedRegionLength = unitLength;
      }

      if (
        repeatedRegionLength >= unitLength * 2 &&
        repeatedRegionLength / characters.length >=
          PASSWORD_STRENGTH_DOMINANT_REPETITION_RATIO
      ) {
        return true;
      }
    }
  }

  return false;
}

function hasLowCharacterDiversity(characters: string[]): boolean {
  return (
    characters.length >= PASSWORD_STRENGTH_LENGTH_THRESHOLDS[3] &&
    new Set(characters).size <
      PASSWORD_STRENGTH_MINIMUM_MAX_SCORE_UNIQUE_CHARACTERS
  );
}

function hasDominantRepeatedCharacters(characters: string[]): boolean {
  let repeatedCharacters = 0;
  let runLength = 1;

  for (let index = 1; index < characters.length; index += 1) {
    if (characters[index] === characters[index - 1]) {
      runLength += 1;
      continue;
    }

    if (runLength > 1) repeatedCharacters += runLength;
    runLength = 1;
  }

  if (runLength > 1) repeatedCharacters += runLength;

  return (
    repeatedCharacters / characters.length >=
    PASSWORD_STRENGTH_DOMINANT_REPEATED_CHARACTER_RATIO
  );
}

function countCharacterClasses(characters: string[]): number {
  const classes = new Set<"letter" | "number" | "symbol" | "whitespace">();

  for (const character of characters) {
    if (/\p{L}/u.test(character)) classes.add("letter");
    else if (/\p{N}/u.test(character)) classes.add("number");
    else if (/\s/u.test(character)) classes.add("whitespace");
    else classes.add("symbol");
  }

  return classes.size;
}

function hasDominantPredictableSequence(characters: string[]): boolean {
  if (characters.length < PASSWORD_STRENGTH_SEQUENCE_MINIMUM_LENGTH) {
    return false;
  }

  const coveredIndexes = new Set<number>();

  for (
    let start = 0;
    start <= characters.length - PASSWORD_STRENGTH_SEQUENCE_MINIMUM_LENGTH;
    start += 1
  ) {
    const candidate = characters
      .slice(start, start + PASSWORD_STRENGTH_SEQUENCE_MINIMUM_LENGTH)
      .join("");

    if (
      PASSWORD_STRENGTH_PREDICTABLE_SEQUENCES.some((sequence) =>
        sequence.includes(candidate),
      )
    ) {
      for (
        let offset = 0;
        offset < PASSWORD_STRENGTH_SEQUENCE_MINIMUM_LENGTH;
        offset += 1
      ) {
        coveredIndexes.add(start + offset);
      }
    }
  }

  return (
    coveredIndexes.size / characters.length >=
    PASSWORD_STRENGTH_DOMINANT_SEQUENCE_RATIO
  );
}
