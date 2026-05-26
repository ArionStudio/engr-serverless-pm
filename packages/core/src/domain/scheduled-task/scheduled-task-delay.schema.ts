import { z } from "zod";

export const clipboardClearDelayMsSchema = z.union([
  z.literal(30_000), // 30 seconds
  z.literal(60_000), // 1 minute
  z.literal(120_000), // 2 minutes
  z.literal(300_000), // 5 minutes
]);

export const vaultLockDelayMsSchema = z.union([
  z.literal(60_000), // 1 minute
  z.literal(300_000), // 5 minutes
  z.literal(600_000), // 10 minutes
  z.literal(1_800_000), // 30 minutes
  z.literal(3_600_000), // 1 hour
]);
