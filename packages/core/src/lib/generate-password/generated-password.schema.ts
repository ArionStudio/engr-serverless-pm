import { z } from "zod";

export const generatedPasswordSettingsSchema = z
  .object({
    // Stored password entries allow 512 chars, but generated passwords are capped
    // lower because practical generated passwords do not need that much length.
    length: z.number().int().min(1).max(128).default(14),
    uppercase: z.boolean().default(true),
    lowercase: z.boolean().default(true),
    numbers: z.boolean().default(true),
    special: z.boolean().default(false),
    minNumbers: z.number().int().min(0).max(128).default(1),
    minSpecial: z.number().int().min(0).max(128).default(0),
    avoidAmbiguousCharacters: z.boolean().default(false),
  })
  .refine(
    (settings) => settings.minNumbers + settings.minSpecial <= settings.length,
    {
      message: "Sum of minNumbers and minSpecial cannot exceed length",
    },
  );
