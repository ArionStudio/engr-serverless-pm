import { pickRandomIndex } from "../../domain/crypto/random.utils";
import { generatedPasswordSettingsSchema } from "../../domain/password-tools/generated-password.schema";
import type { GeneratedPasswordSettings } from "../../domain/password-tools/generated-password.type";
import {
  canGeneratePassword,
  getGeneratedPasswordCharacterSets,
  pickGeneratedPasswordCharacters,
  shuffleGeneratedPasswordCharacters,
} from "../../domain/password-tools/generated-password.utils";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import {
  InvalidGeneratedPasswordSettingsError,
  PasswordGenerationImpossibleError,
} from "../__errors/generate-password.errors";

export type GeneratePasswordCommandParams = Partial<GeneratedPasswordSettings>;

export type GeneratePasswordResult = {
  password: string;
};

export class GeneratePasswordUseCase {
  private readonly crypto: CryptoPort;

  constructor(crypto: CryptoPort) {
    this.crypto = crypto;
  }

  async execute(
    params: GeneratePasswordCommandParams = {},
  ): Promise<GeneratePasswordResult> {
    const settingsResult = generatedPasswordSettingsSchema.safeParse(params);

    if (!settingsResult.success) {
      throw new InvalidGeneratedPasswordSettingsError(settingsResult.error);
    }

    const settings = settingsResult.data;
    const characterSets = getGeneratedPasswordCharacterSets(settings);

    if (!canGeneratePassword(settings, characterSets)) {
      throw new PasswordGenerationImpossibleError(
        "settings cannot produce a password",
      );
    }

    const characters = await pickGeneratedPasswordCharacters(
      settings,
      characterSets,
      (maxExclusive) =>
        pickRandomIndex(maxExclusive, this.crypto.generateRandomBytes),
    );

    return {
      password: (
        await shuffleGeneratedPasswordCharacters(characters, (maxExclusive) =>
          pickRandomIndex(maxExclusive, this.crypto.generateRandomBytes),
        )
      ).join(""),
    };
  }
}
