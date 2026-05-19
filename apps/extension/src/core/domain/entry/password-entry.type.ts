import { z } from "zod";
import { passwordEntryInputSchema } from "./password-entry.schema";

export type PasswordEntryInput = z.infer<typeof passwordEntryInputSchema>;

export type PasswordEntry = PasswordEntryInput & {
  id: string;
};
