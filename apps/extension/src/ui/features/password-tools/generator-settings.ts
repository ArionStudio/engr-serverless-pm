import type { PasswordSettings } from "./generator.view";

export const defaultPasswordSettings: PasswordSettings = {
  length: 24,
  uppercase: true,
  lowercase: true,
  numbers: true,
  special: true,
  minNumbers: 1,
  minSpecial: 1,
  avoidAmbiguousCharacters: false,
};
