export function normalizeGeneratedUsernameWord(word: string): string {
  return word.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}
