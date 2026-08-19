import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import type { SyncUploadOutcome } from "../../ports/sync/sync-provider.port";
import {
  InvalidSyncProviderOutcomeError,
  RemoteVaultSnapshotChangedError,
  SyncProviderUploadRejectedError,
} from "../../errors/sync.errors";

export function requireSyncProviderAccessOutcome(
  value: unknown,
): "accessible" | "authentication_rejected" {
  if (value !== "accessible" && value !== "authentication_rejected") {
    throw new InvalidSyncProviderOutcomeError("access");
  }

  return value;
}

export function requireSyncProviderUploadOutcome(
  value: unknown,
): SyncUploadOutcome {
  try {
    return decodeSyncProviderUploadOutcome(value);
  } catch (error) {
    if (error instanceof InvalidSyncProviderOutcomeError) {
      throw error;
    }

    throw new InvalidSyncProviderOutcomeError("upload");
  }
}

function decodeSyncProviderUploadOutcome(value: unknown): SyncUploadOutcome {
  const record = requirePlainRecord(value);
  const status = requireDataProperty(record, "status");

  if (status === "committed" || status === "outcome_unknown") {
    requireExactKeys(record, ["status"]);
    return { status };
  }

  if (status === "definitely_not_committed") {
    requireExactKeys(record, ["status", "reason"]);

    const reason = requireDataProperty(record, "reason");

    if (
      reason !== "remote_snapshot_changed" &&
      reason !== "provider_rejected"
    ) {
      throw new InvalidSyncProviderOutcomeError("upload");
    }

    return { status, reason };
  }

  throw new InvalidSyncProviderOutcomeError("upload");
}

export function resolveSyncProviderUploadOutcome(
  value: unknown,
): SyncUploadOutcome {
  try {
    return requireSyncProviderUploadOutcome(value);
  } catch (error) {
    if (error instanceof InvalidSyncProviderOutcomeError) {
      return { status: "outcome_unknown" };
    }

    throw error;
  }
}

export function resolveNonStartedSyncProviderUploadOutcome(
  value: unknown,
): SyncUploadOutcome {
  const outcome = resolveSyncProviderUploadOutcome(value);

  return outcome.status === "definitely_not_committed"
    ? outcome
    : { status: "outcome_unknown" };
}

export function resolveSyncProviderUploadStatus(
  vaultId: string,
  value: unknown,
): SyncUploadStatus {
  const outcome = resolveSyncProviderUploadOutcome(value);

  if (outcome.status === "committed") {
    return "complete";
  }

  if (outcome.status === "outcome_unknown") {
    return "pending";
  }

  if (outcome.reason === "remote_snapshot_changed") {
    throw new RemoteVaultSnapshotChangedError(vaultId);
  }

  throw new SyncProviderUploadRejectedError(vaultId);
}

function requirePlainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidSyncProviderOutcomeError("upload");
  }

  const prototype = Object.getPrototypeOf(value) as unknown;

  if (prototype !== Object.prototype && prototype !== null) {
    throw new InvalidSyncProviderOutcomeError("upload");
  }

  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  const keys = Reflect.ownKeys(record);

  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    throw new InvalidSyncProviderOutcomeError("upload");
  }
}

function requireDataProperty(
  record: Record<string, unknown>,
  key: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);

  if (descriptor === undefined || !("value" in descriptor)) {
    throw new InvalidSyncProviderOutcomeError("upload");
  }

  return descriptor.value;
}
