import { generatedPasswordSettingsSchema } from "../../domain/password-tools/generated-password.schema";
import type { GeneratedPasswordSettings } from "../../domain/password-tools/generated-password.type";
import {
  canGeneratePassword,
  getGeneratedPasswordCharacterSets,
  pickGeneratedPasswordCharacters,
  shuffleGeneratedPasswordCharacters,
} from "../../domain/password-tools/generated-password.utils";
import {
  InvalidGeneratedPasswordSettingsError,
  PasswordGenerationImpossibleError,
} from "../../application/errors/generate-password.errors";
import type { RandomSamplerService } from "../../application/randomness/random-sampler.service";

export type GeneratePasswordCommandParams = Partial<GeneratedPasswordSettings>;

export type GeneratePasswordResult = {
  password: string;
};

export class GeneratePasswordUseCase {
  private readonly randomSampler: RandomSamplerService;

  constructor(randomSampler: RandomSamplerService) {
    this.randomSampler = randomSampler;
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
      (maxExclusive) => this.randomSampler.pickIndex(maxExclusive),
    );

    return {
      password: (
        await shuffleGeneratedPasswordCharacters(characters, (maxExclusive) =>
          this.randomSampler.pickIndex(maxExclusive),
        )
      ).join(""),
    };
  }
}
