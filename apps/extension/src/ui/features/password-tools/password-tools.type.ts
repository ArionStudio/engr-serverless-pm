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
  /** Copies a generated value through the app's timed clipboard-clear path. */
  copy?: (value: string) => Promise<void>;
};
