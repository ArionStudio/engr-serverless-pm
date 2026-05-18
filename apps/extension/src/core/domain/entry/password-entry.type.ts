import { z } from "zod";
import { passwordEntrySchema } from "./password-entry.schema";

export type PasswordEntry = z.infer<typeof passwordEntrySchema>;
