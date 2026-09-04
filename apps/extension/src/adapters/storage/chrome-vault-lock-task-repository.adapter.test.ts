import { describe, expect, it, vi } from "vitest";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import type { WebLockManager } from "../clipboard";
import { InvalidScheduledTaskRecordError } from "../system";
import {
  ChromeVaultLockTaskRepositoryAdapter,
  VAULT_LOCK_TASK_STORAGE_ACCESS_LEVEL,
  VAULT_LOCK_TASK_STORAGE_KEY,
  VAULT_LOCK_TASK_STORAGE_LOCK_NAME,
} from "./chrome-vault-lock-task-repository.adapter";

const immediateLockManager: WebLockManager = {
  request: async (_name, operation) => operation(null),
};

const vaultLockTask = {
  actionId: "lock-action-id",
  vaultId: "vault-id",
  expiresAt: 61_000,
};

describe("ChromeVaultLockTaskRepositoryAdapter", () => {
  it("stores only volatile trusted-context lock ownership metadata", async () => {
    const { getRecords, storageArea } = createChromeStorageArea();
    const lockManager: WebLockManager = {
      request: vi.fn(async (_name, operation) => operation(null)),
    };
    const repository = new ChromeVaultLockTaskRepositoryAdapter(
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
    const repository = new ChromeVaultLockTaskRepositoryAdapter(
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
    const repository = new ChromeVaultLockTaskRepositoryAdapter(
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

  it("runs only a matching action while retaining its ownership metadata", async () => {
    const { storageArea } = createChromeStorageArea();
    const repository = new ChromeVaultLockTaskRepositoryAdapter(
      storageArea,
      immediateLockManager,
    );
    const operation = vi.fn(async () => "completed");
    await repository.save(vaultLockTask);

    await expect(
      repository.runIfActionIsActive("stale-action-id", operation),
    ).resolves.toEqual({ status: "stale_action" });
    await expect(
      repository.runIfActionIsActive(vaultLockTask.actionId, operation),
    ).resolves.toEqual({ status: "executed", result: "completed" });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledWith(vaultLockTask);
    await expect(repository.get()).resolves.toEqual(vaultLockTask);
  });

  it("retains matching ownership when the claimed operation rejects", async () => {
    const { storageArea } = createChromeStorageArea();
    const repository = new ChromeVaultLockTaskRepositoryAdapter(
      storageArea,
      immediateLockManager,
    );
    const error = new Error("session removal failed");
    await repository.save(vaultLockTask);

    await expect(
      repository.runIfActionIsActive(vaultLockTask.actionId, async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    await expect(repository.get()).resolves.toEqual(vaultLockTask);
  });

  it("blocks replacement saves until a matching action operation finishes", async () => {
    let previousOperation = Promise.resolve();
    const lockManager: WebLockManager = {
      request: vi.fn(async (_name, operation) => {
        const waitForPrevious = previousOperation;
        let finishOperation!: () => void;
        previousOperation = new Promise<void>((resolve) => {
          finishOperation = resolve;
        });
        await waitForPrevious;

        try {
          return await operation(null);
        } finally {
          finishOperation();
        }
      }),
    };
    const { getRecords, storageArea } = createChromeStorageArea();
    const repository = new ChromeVaultLockTaskRepositoryAdapter(
      storageArea,
      lockManager,
    );
    const replacementTask = {
      ...vaultLockTask,
      actionId: "replacement-action-id",
    };
    let operationStarted!: () => void;
    let finishClaimedOperation!: () => void;
    const claimedOperationStarted = new Promise<void>((resolve) => {
      operationStarted = resolve;
    });
    const claimedOperationCanFinish = new Promise<void>((resolve) => {
      finishClaimedOperation = resolve;
    });
    await repository.save(vaultLockTask);

    const claimedOperation = repository.runIfActionIsActive(
      vaultLockTask.actionId,
      async () => {
        operationStarted();
        await claimedOperationCanFinish;
      },
    );
    await claimedOperationStarted;
    const replacementSave = repository.save(replacementTask);
    await Promise.resolve();

    expect(getRecords()[VAULT_LOCK_TASK_STORAGE_KEY]).toEqual(vaultLockTask);

    finishClaimedOperation();
    await claimedOperation;
    await replacementSave;
    expect(getRecords()[VAULT_LOCK_TASK_STORAGE_KEY]).toEqual(replacementTask);
  });

  it("observes immediate access restriction rejection until an operation awaits it", async () => {
    const error = new Error("access restriction failed");
    const { storageArea } = createChromeStorageArea();
    const setAccessLevel = storageArea.setAccessLevel;
    if (setAccessLevel === undefined) {
      throw new Error("Expected the storage fixture to restrict access.");
    }
    vi.mocked(setAccessLevel).mockReturnValueOnce(Promise.reject(error));
    const repository = new ChromeVaultLockTaskRepositoryAdapter(
      storageArea,
      immediateLockManager,
    );

    await Promise.resolve();

    await expect(repository.get()).rejects.toBe(error);
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
    const repository = new ChromeVaultLockTaskRepositoryAdapter(
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
    const repository = new ChromeVaultLockTaskRepositoryAdapter(
      storageArea,
      immediateLockManager,
    );

    await expect(
      repository.removeIfActionIsActive(vaultLockTask.actionId),
    ).rejects.toBeInstanceOf(InvalidScheduledTaskRecordError);
    expect(getRecords()[VAULT_LOCK_TASK_STORAGE_KEY]).toEqual(malformed);
  });
});
