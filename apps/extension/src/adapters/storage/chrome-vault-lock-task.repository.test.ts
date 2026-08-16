import { describe, expect, it, vi } from "vitest";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import type { WebLockManager } from "../clipboard";
import { InvalidScheduledTaskRecordError } from "../system";
import {
  ChromeVaultLockTaskRepository,
  VAULT_LOCK_TASK_STORAGE_ACCESS_LEVEL,
  VAULT_LOCK_TASK_STORAGE_KEY,
  VAULT_LOCK_TASK_STORAGE_LOCK_NAME,
} from "./chrome-vault-lock-task.repository";

const immediateLockManager: WebLockManager = {
  request: async (_name, operation) => operation(null),
};

const vaultLockTask = {
  actionId: "lock-action-id",
  vaultId: "vault-id",
  expiresAt: 61_000,
};

describe("ChromeVaultLockTaskRepository", () => {
  it("stores only volatile trusted-context lock ownership metadata", async () => {
    const { getRecords, storageArea } = createChromeStorageArea();
    const lockManager: WebLockManager = {
      request: vi.fn(async (_name, operation) => operation(null)),
    };
    const repository = new ChromeVaultLockTaskRepository(
      storageArea,
      lockManager,
    );

    await repository.save(vaultLockTask);

    expect(getRecords()[VAULT_LOCK_TASK_STORAGE_KEY]).toEqual(vaultLockTask);
    expect(storageArea.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: VAULT_LOCK_TASK_STORAGE_ACCESS_LEVEL,
    });
    expect(lockManager.request).toHaveBeenCalledWith(
      VAULT_LOCK_TASK_STORAGE_LOCK_NAME,
      expect.any(Function),
    );
  });

  it("round-trips and replaces the active lock task", async () => {
    const { storageArea } = createChromeStorageArea();
    const repository = new ChromeVaultLockTaskRepository(
      storageArea,
      immediateLockManager,
    );

    await expect(repository.get()).resolves.toBeNull();
    await repository.save(vaultLockTask);
    await expect(repository.get()).resolves.toEqual(vaultLockTask);
    await repository.save({
      actionId: "replacement-action-id",
      vaultId: "replacement-vault-id",
      expiresAt: 62_000,
    });
    await expect(repository.get()).resolves.toEqual({
      actionId: "replacement-action-id",
      vaultId: "replacement-vault-id",
      expiresAt: 62_000,
    });
  });

  it("atomically removes only the matching action", async () => {
    const { storageArea } = createChromeStorageArea();
    const repository = new ChromeVaultLockTaskRepository(
      storageArea,
      immediateLockManager,
    );
    await repository.save(vaultLockTask);

    await expect(
      repository.removeIfActionIsActive("stale-action-id"),
    ).resolves.toBe(false);
    await expect(repository.get()).resolves.toEqual(vaultLockTask);
    await expect(
      repository.removeIfActionIsActive(vaultLockTask.actionId),
    ).resolves.toBe(true);
    await expect(repository.get()).resolves.toBeNull();
  });

  it.each([
    {},
    { ...vaultLockTask, futureField: true },
    { ...vaultLockTask, actionId: "" },
    { ...vaultLockTask, vaultId: "" },
    { ...vaultLockTask, expiresAt: -1 },
    { ...vaultLockTask, expiresAt: 1.5 },
    { ...vaultLockTask, expiresAt: Number.POSITIVE_INFINITY },
    { ...vaultLockTask, expiresAt: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects malformed persisted lock metadata", async (record) => {
    const { storageArea } = createChromeStorageArea({
      [VAULT_LOCK_TASK_STORAGE_KEY]: record,
    });
    const repository = new ChromeVaultLockTaskRepository(
      storageArea,
      immediateLockManager,
    );

    await expect(repository.get()).rejects.toBeInstanceOf(
      InvalidScheduledTaskRecordError,
    );
  });

  it("does not remove malformed metadata", async () => {
    const malformed = { ...vaultLockTask, expiresAt: "later" };
    const { getRecords, storageArea } = createChromeStorageArea({
      [VAULT_LOCK_TASK_STORAGE_KEY]: malformed,
    });
    const repository = new ChromeVaultLockTaskRepository(
      storageArea,
      immediateLockManager,
    );

    await expect(
      repository.removeIfActionIsActive(vaultLockTask.actionId),
    ).rejects.toBeInstanceOf(InvalidScheduledTaskRecordError);
    expect(getRecords()[VAULT_LOCK_TASK_STORAGE_KEY]).toEqual(malformed);
  });
});
