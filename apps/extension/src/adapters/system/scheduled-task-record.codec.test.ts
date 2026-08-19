import { describe, expect, it } from "vitest";
import {
  InvalidScheduledTaskRecordError,
  SCHEDULED_TASK_ALARM_PREFIX,
  decodeClipboardClearTaskRecord,
  decodeScheduledTaskAlarmName,
  decodeVaultLockTaskRecord,
  encodeClipboardClearTaskRecord,
  encodeScheduledTaskAlarmName,
  encodeVaultLockTaskRecord,
} from "./scheduled-task-record.codec";

describe("scheduled task record codec", () => {
  it.each(["clearClipboard", "lockVault"] as const)(
    "round-trips a canonical %s alarm name",
    (name) => {
      const task = { name, actionId: "action:/ü id" };
      const alarmName = encodeScheduledTaskAlarmName(task);

      expect(alarmName).toBe(
        `${SCHEDULED_TASK_ALARM_PREFIX}${name}:action%3A%2F%C3%BC%20id`,
      );
      expect(decodeScheduledTaskAlarmName(alarmName)).toEqual(task);
    },
  );

  it("returns null only for unrelated alarm names", () => {
    expect(decodeScheduledTaskAlarmName("other-extension:alarm")).toBeNull();
  });

  it.each([
    `${SCHEDULED_TASK_ALARM_PREFIX}`,
    `${SCHEDULED_TASK_ALARM_PREFIX}unknown:action-id`,
    `${SCHEDULED_TASK_ALARM_PREFIX}lockVault:`,
    `${SCHEDULED_TASK_ALARM_PREFIX}lockVault:%20`,
    `${SCHEDULED_TASK_ALARM_PREFIX}lockVault:%`,
    `${SCHEDULED_TASK_ALARM_PREFIX}lockVault:%61ction-id`,
    `${SCHEDULED_TASK_ALARM_PREFIX}lockVault:action%2fid`,
  ])("rejects malformed or noncanonical alarm name %s", (alarmName) => {
    expect(() => decodeScheduledTaskAlarmName(alarmName)).toThrow(
      InvalidScheduledTaskRecordError,
    );
  });

  it.each([
    {},
    { name: "lockVault", actionId: "action-id", futureField: true },
    { name: "futureTask", actionId: "action-id" },
    { name: "lockVault", actionId: "" },
    { name: "lockVault", actionId: "\uD800" },
  ])("rejects malformed scheduled task input", (task) => {
    expect(() =>
      encodeScheduledTaskAlarmName(
        task as Parameters<typeof encodeScheduledTaskAlarmName>[0],
      ),
    ).toThrow(InvalidScheduledTaskRecordError);
  });

  it("exactly round-trips clipboard and vault-lock metadata", () => {
    const clipboardTask = {
      actionId: "clipboard-action",
      copiedValueHash: "a".repeat(64),
      expiresAt: 0,
    };
    const vaultLockTask = {
      actionId: "lock-action",
      vaultId: "vault-id",
      expiresAt: Number.MAX_SAFE_INTEGER,
    };

    expect(
      decodeClipboardClearTaskRecord(
        encodeClipboardClearTaskRecord(clipboardTask),
      ),
    ).toEqual(clipboardTask);
    expect(
      decodeVaultLockTaskRecord(encodeVaultLockTaskRecord(vaultLockTask)),
    ).toEqual(vaultLockTask);
  });

  it.each([
    {},
    {
      actionId: "action-id",
      copiedValueHash: "a".repeat(64),
      expiresAt: 1,
      futureField: true,
    },
    { actionId: "action-id", copiedValueHash: "a".repeat(64) },
    {
      actionId: "action-id",
      copiedValueHash: "a".repeat(64),
      expiresAt: -1,
    },
    {
      actionId: "action-id",
      copiedValueHash: "a".repeat(64),
      expiresAt: 1.5,
    },
    {
      actionId: "action-id",
      copiedValueHash: "a".repeat(64),
      expiresAt: Number.POSITIVE_INFINITY,
    },
    {
      actionId: "action-id",
      copiedValueHash: "a".repeat(64),
      expiresAt: Number.MAX_SAFE_INTEGER + 1,
    },
  ])("rejects hostile clipboard task metadata", (record) => {
    expect(() => decodeClipboardClearTaskRecord(record)).toThrow(
      InvalidScheduledTaskRecordError,
    );
  });

  it.each([
    {},
    {
      actionId: "action-id",
      vaultId: "vault-id",
      expiresAt: 1,
      futureField: true,
    },
    { actionId: "action-id", vaultId: "vault-id", expiresAt: -1 },
    { actionId: "action-id", vaultId: "vault-id", expiresAt: 1.5 },
    { actionId: "action-id", vaultId: "", expiresAt: 1 },
  ])("rejects hostile vault-lock task metadata", (record) => {
    expect(() => decodeVaultLockTaskRecord(record)).toThrow(
      InvalidScheduledTaskRecordError,
    );
  });

  it("rejects class instances even when their enumerable fields match", () => {
    class HostileTaskRecord {
      readonly actionId = "action-id";
      readonly vaultId = "vault-id";
      readonly expiresAt = 1;
    }

    expect(() => decodeVaultLockTaskRecord(new HostileTaskRecord())).toThrow(
      InvalidScheduledTaskRecordError,
    );
  });

  it("uses the exact secret-free static error contract", () => {
    let caught: unknown;

    try {
      decodeClipboardClearTaskRecord({ hostileSecret: "do-not-retain" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidScheduledTaskRecordError);
    expect(caught).toMatchObject({
      name: "InvalidScheduledTaskRecordError",
      message: "Scheduled task record is malformed.",
    });
    expect(Object.prototype.hasOwnProperty.call(caught, "cause")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(caught, "input")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(caught, "hostileSecret")).toBe(
      false,
    );
  });
});
