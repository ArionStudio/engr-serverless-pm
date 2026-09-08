import { CheckPasswordStrengthUseCase } from "@lfspm/core";
import type { EntryTools } from "@/ui/features/entries/entry-editor.view";
const strength = new CheckPasswordStrengthUseCase();
export const entryToolsFixture: EntryTools = {
  assess: (password) => strength.execute({ password }),
  generate: async () => ({ password: "Gallery-River-8!Pine-Sky" }),
  username: async () => ({ username: "river-pine-42" }),
};
export const exampleEntry = {
  id: "entry-review",
  login: "adrian@example.test",
  sanitizedUrl: "https://mail.example.test/login",
  tags: [1],
};
