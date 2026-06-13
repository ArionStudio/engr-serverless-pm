import { generatedUsernameSettingsSchema } from "../../domain/password-tools/generated-username.schema";
import type { GeneratedUsernameSettings } from "../../domain/password-tools/generated-username.type";
import { generateUsernameValue } from "../../domain/password-tools/generated-username.utils";
import { InvalidGeneratedUsernameSettingsError } from "../../errors/generate-username.errors";
import type { RandomSamplerService } from "../../services/randomness/random-sampler.service";

export type GenerateUsernameCommandParams = Partial<GeneratedUsernameSettings>;

export type GenerateUsernameResult = {
  username: string;
};

export class GenerateUsernameUseCase {
  private readonly randomSampler: RandomSamplerService;

  constructor(randomSampler: RandomSamplerService) {
    this.randomSampler = randomSampler;
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
        (maxExclusive) => this.randomSampler.pickIndex(maxExclusive),
      ),
    };
  }
}
