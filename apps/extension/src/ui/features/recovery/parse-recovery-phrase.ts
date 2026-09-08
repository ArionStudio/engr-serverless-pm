// Presentation parsing only. BIP39 checksum and recovery ownership remain core checks.
export function parseRecoveryPhrase(value: string): string[] | undefined {
  const tokens = value
    .trim()
    .toLowerCase()
    .replace(/(\d+)[.)]\s*/g, "$1 ")
    .split(/\s+/);
  const isWord = (word: string) => /^[a-z]+$/.test(word);
  if (tokens.length === 24 && tokens.every(isWord)) return tokens;
  if (tokens.length !== 48) return undefined;
  const words: string[] = [];
  for (let index = 0; index < 24; index++) {
    const word = tokens[index * 2 + 1];
    if (tokens[index * 2] !== String(index + 1) || !isWord(word))
      return undefined;
    words.push(word);
  }
  return words;
}
