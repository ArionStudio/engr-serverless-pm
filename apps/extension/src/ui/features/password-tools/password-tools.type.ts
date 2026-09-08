import type {
  GeneratePasswordCommandParams,
  GenerateUsernameCommandParams,
} from "@lfspm/core";
export type EntryTools = {
  assess: (password: string) => Promise<{ score: 0 | 1 | 2 | 3 | 4 }>;
  generate: (
    settings: GeneratePasswordCommandParams,
  ) => Promise<{ password: string }>;
  username: (
    settings: GenerateUsernameCommandParams,
  ) => Promise<{ username: string }>;
};
