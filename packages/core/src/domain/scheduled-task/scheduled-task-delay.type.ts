import type { z } from "zod";
import type {
  clipboardClearDelayMsSchema,
  vaultLockDelayMsSchema,
} from "./scheduled-task-delay.schema";

export type ClipboardClearDelayMs = z.infer<typeof clipboardClearDelayMsSchema>;

export type VaultLockDelayMs = z.infer<typeof vaultLockDelayMsSchema>;
