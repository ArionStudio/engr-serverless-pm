import { pickRandomIndex } from "../../domain/crypto/random.utils";
import { generatedUsernameSettingsSchema } from "../../domain/password-tools/generated-username.schema";
import type { GeneratedUsernameSettings } from "../../domain/password-tools/generated-username.type";
import { generateUsernameValue } from "../../domain/password-tools/generated-username.utils";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import { InvalidGeneratedUsernameSettingsError } from "../../application/errors/generate-username.errors";

export type GenerateUsernameCommandParams = Partial<GeneratedUsernameSettings>;

export type GenerateUsernameResult = {
  username: string;
};

export class GenerateUsernameUseCase {
  private readonly crypto: CryptoPort;

  constructor(crypto: CryptoPort) {
    this.crypto = crypto;
  }

  async execute(
    params: GenerateUsernameCommandParams = {},
  ): Promise<GenerateUsernameResult> {
    const settingsResult = generatedUsernameSettingsSchema.safeParse(params);

    if (!settingsResult.success) {
      throw new InvalidGeneratedUsernameSettingsError(settingsResult.error);
    }

    return {
      username: await generateUsernameValue(
        settingsResult.data,
        (maxExclusive) =>
          pickRandomIndex(maxExclusive, this.crypto.generateRandomBytes),
      ),
    };
  }
}
