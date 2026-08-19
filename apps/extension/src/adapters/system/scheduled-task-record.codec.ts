import type {
  ClipboardClearTask,
  ScheduledTask,
  VaultLockTask,
} from "@lfspm/core";
import { exactRecord } from "../codecs/artifact-codec.primitives";

export const SCHEDULED_TASK_ALARM_PREFIX = "lfspm:scheduled-task:";

export class InvalidScheduledTaskRecordError extends Error {
  override readonly name = "InvalidScheduledTaskRecordError";

  constructor() {
    super("Scheduled task record is malformed.");
  }
}

export function encodeScheduledTaskAlarmName(value: ScheduledTask): string {
  try {
    const task = decodeScheduledTask(value);
    return `${SCHEDULED_TASK_ALARM_PREFIX}${task.name}:${encodeURIComponent(task.actionId)}`;
  } catch {
    throw new InvalidScheduledTaskRecordError();
  }
}

export function decodeScheduledTaskAlarmName(
  value: unknown,
): ScheduledTask | null {
  if (typeof value !== "string") {
    throw new InvalidScheduledTaskRecordError();
  }

  if (!value.startsWith(SCHEDULED_TASK_ALARM_PREFIX)) {
    return null;
  }

  try {
    const serializedTask = value.slice(SCHEDULED_TASK_ALARM_PREFIX.length);
    const separatorIndex = serializedTask.indexOf(":");

    if (separatorIndex < 1) {
      throw new Error("task name");
    }

    const task = decodeScheduledTask({
      name: serializedTask.slice(0, separatorIndex),
      actionId: decodeURIComponent(serializedTask.slice(separatorIndex + 1)),
    });

    if (encodeScheduledTaskAlarmName(task) !== value) {
      throw new Error("noncanonical task");
    }

    return task;
  } catch {
    throw new InvalidScheduledTaskRecordError();
  }
}

export function encodeClipboardClearTaskRecord(
  value: ClipboardClearTask,
): unknown {
  const task = decodeClipboardClearTaskRecord(value);
  return {
    actionId: task.actionId,
    copiedValueHash: task.copiedValueHash,
    expiresAt: task.expiresAt,
  };
}

export function decodeClipboardClearTaskRecord(
  value: unknown,
): ClipboardClearTask {
  try {
    const record = exactRecord(value, [
      "actionId",
      "copiedValueHash",
      "expiresAt",
    ]);
    const copiedValueHash = requireString(record.copiedValueHash);

    if (!/^[0-9a-f]{64}$/.test(copiedValueHash)) {
      throw new Error("copied value hash");
    }

    return {
      actionId: decodeActionId(record.actionId),
      copiedValueHash,
      expiresAt: decodeExpiry(record.expiresAt),
    };
  } catch {
    throw new InvalidScheduledTaskRecordError();
  }
}

export function encodeVaultLockTaskRecord(value: VaultLockTask): unknown {
  const task = decodeVaultLockTaskRecord(value);
  return {
    actionId: task.actionId,
    vaultId: task.vaultId,
    expiresAt: task.expiresAt,
  };
}

export function decodeVaultLockTaskRecord(value: unknown): VaultLockTask {
  try {
    const record = exactRecord(value, ["actionId", "expiresAt", "vaultId"]);

    return {
      actionId: decodeActionId(record.actionId),
      vaultId: decodeNonblankString(record.vaultId),
      expiresAt: decodeExpiry(record.expiresAt),
    };
  } catch {
    throw new InvalidScheduledTaskRecordError();
  }
}

export function decodeActionId(value: unknown): string {
  try {
    const actionId = decodeNonblankString(value);
    encodeURIComponent(actionId);
    return actionId;
  } catch {
    throw new InvalidScheduledTaskRecordError();
  }
}

function decodeScheduledTask(value: unknown): ScheduledTask {
  const record = exactRecord(value, ["actionId", "name"]);
  const actionId = decodeActionId(record.actionId);

  if (record.name === "clearClipboard" || record.name === "lockVault") {
    return { name: record.name, actionId };
  }

  throw new InvalidScheduledTaskRecordError();
}

function decodeExpiry(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("expiry");
  }

  return value;
}

function decodeNonblankString(value: unknown): string {
  const stringValue = requireString(value);

  if (stringValue.trim().length === 0) {
    throw new Error("blank string");
  }

  return stringValue;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("string");
  }

  return value;
}
