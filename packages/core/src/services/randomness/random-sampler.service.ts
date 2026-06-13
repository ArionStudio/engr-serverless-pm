import type { RandomBytes } from "../../domain/crypto/brand-keys";
import {
  InvalidRandomBytesLengthError,
  InvalidRandomIndexUpperBoundError,
} from "../../errors/randomness.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";

const UINT32_RANGE = 0x1_0000_0000;

export class RandomSamplerService {
  private readonly crypto: CryptoPort;

  constructor(crypto: CryptoPort) {
    this.crypto = crypto;
  }

  async pickIndex(maxExclusive: number): Promise<number> {
    if (
      !Number.isSafeInteger(maxExclusive) ||
      maxExclusive <= 0 ||
      maxExclusive > UINT32_RANGE
    ) {
      throw new InvalidRandomIndexUpperBoundError();
    }

    // Rejection sampling avoids modulo bias: using value % maxExclusive directly
    // would make lower indexes slightly more likely unless maxExclusive divides
    // the random integer range exactly.
    const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);

    while (true) {
      const value = this.readUint32(await this.crypto.generateRandomBytes(4));

      if (value < limit) {
        return value % maxExclusive;
      }
    }
  }

  private readUint32(randomBytes: RandomBytes): number {
    if (randomBytes.byteLength !== 4) {
      throw new InvalidRandomBytesLengthError(randomBytes.byteLength);
    }

    return new DataView(randomBytes).getUint32(0);
  }
}
