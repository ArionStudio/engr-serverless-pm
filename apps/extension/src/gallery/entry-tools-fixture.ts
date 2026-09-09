import { CheckPasswordStrengthUseCase } from "@lfspm/core";
import type { EntryTools } from "@/ui/features/password-tools/password-tools.type";
const strength = new CheckPasswordStrengthUseCase();
export const entryToolsFixture: EntryTools = {
  assess: (password) => strength.execute({ password }),
  generate: async () => ({ password: "Gallery-River-8!Pine-Sky" }),
  username: async () => ({ username: "river-pine-42" }),
  copy: async () => {},
};
export const exampleEntry = {
  id: "entry-review",
  hasPassword: true,
  login: "adrian@example.test",
  sanitizedUrl: "https://mail.example.test/login",
  tags: ["tag-personal"],
};
