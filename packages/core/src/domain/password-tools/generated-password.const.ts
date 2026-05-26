export const GENERATED_PASSWORD_FULL_CHARACTER_SETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  special: "!@#$%^&*",
} as const;

// Avoids glyphs users commonly confuse when reading or typing passwords manually.
// Matches Bitwarden's "unmistakable" generator sets:
// https://github.com/bitwarden/clients/blob/cdbe896d63c1f2fb73ce28356e705f5be7192aaf/libs/tools/generator/core/src/engine/data.ts
export const GENERATED_PASSWORD_UNMISTAKABLE_CHARACTER_SETS = {
  uppercase: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lowercase: "abcdefghijkmnopqrstuvwxyz",
  numbers: "23456789",
  special: GENERATED_PASSWORD_FULL_CHARACTER_SETS.special,
} as const;
