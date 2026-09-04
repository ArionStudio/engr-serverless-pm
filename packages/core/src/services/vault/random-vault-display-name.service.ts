import { GENERATED_USERNAME_WORDS } from "../../lib/generate-username";
import { normalizeGeneratedUsernameWord } from "../../lib/generate-username/generated-username-word.policy";
import type { VaultDisplayNamePort } from "../../ports/vault/vault-display-name.port";
import type { RandomSamplerService } from "../randomness/random-sampler.service";

const DISPLAY_NAME_NUMBER_RANGE = 10_000;
const DISPLAY_NAME_NUMBER_LENGTH = 4;

type IndexSampler = Pick<RandomSamplerService, "pickIndex">;

export class RandomVaultDisplayNameService implements VaultDisplayNamePort {
  private readonly sampler: IndexSampler;

  constructor(sampler: IndexSampler) {
    this.sampler = sampler;
  }

  async generateVaultDisplayName(): Promise<string> {
    const firstWordIndex = await this.sampler.pickIndex(
      GENERATED_USERNAME_WORDS.length,
    );
    const secondWordIndex = await this.sampler.pickIndex(
      GENERATED_USERNAME_WORDS.length,
    );
    const number = await this.sampler.pickIndex(DISPLAY_NAME_NUMBER_RANGE);

    const firstWord = normalizeGeneratedUsernameWord(
      GENERATED_USERNAME_WORDS[firstWordIndex],
    );
    const secondWord = normalizeGeneratedUsernameWord(
      GENERATED_USERNAME_WORDS[secondWordIndex],
    );

    return `${firstWord}-${secondWord}-${number.toString().padStart(DISPLAY_NAME_NUMBER_LENGTH, "0")}`;
  }
}
