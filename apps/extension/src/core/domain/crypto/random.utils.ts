import type { RandomBytes } from "./brand-keys";
import { UINT32_RANGE } from "./random.const";

export type GenerateRandomBytes = (byteLength: number) => Promise<RandomBytes>;

export async function pickRandomIndex(
  maxExclusive: number,
  generateRandomBytes: GenerateRandomBytes,
): Promise<number> {
  if (maxExclusive < 1) {
    throw new Error("Random index upper bound must be positive.");
  }

  // Rejection sampling avoids modulo bias: using value % maxExclusive directly
  // would make lower indexes slightly more likely unless maxExclusive divides
  // the random integer range exactly.
  const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);

  while (true) {
    const value = readUint32(await generateRandomBytes(4));

    if (value < limit) {
      return value % maxExclusive;
    }
  }
}

function readUint32(randomBytes: RandomBytes): number {
  if (randomBytes.byteLength !== 4) {
    throw new Error("Random byte source returned invalid byte length.");
  }

  return new DataView(randomBytes).getUint32(0);
}
