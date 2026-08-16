import { InvalidSyncProviderOutcomeError } from "../../errors/sync.errors";

export function requireSyncProviderAccessOutcome(
  value: unknown,
): "accessible" | "authentication_rejected" {
  if (value !== "accessible" && value !== "authentication_rejected") {
    throw new InvalidSyncProviderOutcomeError();
  }

  return value;
}
