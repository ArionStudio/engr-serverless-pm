import type { VaultLockTask, VaultLockTaskRepositoryPort } from "@lfspm/core";
import type { WebLockManager } from "../clipboard/web-locks-clipboard-operation-coordinator.adapter";
import {
  decodeActionId,
  decodeVaultLockTaskRecord,
  encodeVaultLockTaskRecord,
} from "../system/scheduled-task-record.codec";
import type { ChromeStorageArea } from "./chrome-storage-area.type";

export const VAULT_LOCK_TASK_STORAGE_KEY = "vaultLockTask";
export const VAULT_LOCK_TASK_STORAGE_ACCESS_LEVEL = "TRUSTED_CONTEXTS";
export const VAULT_LOCK_TASK_STORAGE_LOCK_NAME = "lfspm:vault-lock-task";

export class ChromeVaultLockTaskRepositoryAdapter implements VaultLockTaskRepositoryPort {
  private readonly storageArea: ChromeStorageArea;
  private readonly storageKey: string;
  private readonly lockManager: WebLockManager;
  private readonly accessRestriction: Promise<void>;

  constructor(
    storageArea: ChromeStorageArea = chrome.storage
      .session as ChromeStorageArea,
    lockManager: WebLockManager = navigator.locks,
    storageKey = VAULT_LOCK_TASK_STORAGE_KEY,
  ) {
    this.storageArea = storageArea;
    this.storageKey = storageKey;
    this.lockManager = lockManager;
    const accessRestriction =
      storageArea.setAccessLevel?.({
        accessLevel: VAULT_LOCK_TASK_STORAGE_ACCESS_LEVEL,
      }) ?? Promise.resolve();
    void accessRestriction.catch(() => undefined);
    this.accessRestriction = accessRestriction;
  }

  async save(task: VaultLockTask): Promise<void> {
    await this.withStorageLock(async () => {
      await this.storageArea.set({
        [this.storageKey]: encodeVaultLockTaskRecord(task),
      });
    });
  }

  async get(): Promise<VaultLockTask | null> {
    return this.withStorageLock(() => this.readTask());
  }

  async runIfActionIsActive<T>(
    actionId: string,
    operation: (task: VaultLockTask) => Promise<T>,
  ): Promise<
    | { readonly status: "executed"; readonly result: T }
    | { readonly status: "stale_action" }
  > {
    const decodedActionId = decodeActionId(actionId);

    return this.withStorageLock(async () => {
      const task = await this.readTask();

      if (task === null || task.actionId !== decodedActionId) {
        return { status: "stale_action" };
      }

      return { status: "executed", result: await operation(task) };
    });
  }

  async removeIfActionIsActive(actionId: string): Promise<boolean> {
    const decodedActionId = decodeActionId(actionId);

    return this.withStorageLock(async () => {
      const task = await this.readTask();

      if (task === null || task.actionId !== decodedActionId) {
        return false;
      }

      await this.storageArea.remove(this.storageKey);
      return true;
    });
  }

  private async readTask(): Promise<VaultLockTask | null> {
    const storedRecords = await this.storageArea.get(this.storageKey);
    const task = storedRecords[this.storageKey];

    return task === undefined ? null : decodeVaultLockTaskRecord(task);
  }

  private async withStorageLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.accessRestriction;
    return this.lockManager.request(VAULT_LOCK_TASK_STORAGE_LOCK_NAME, () =>
      operation(),
    );
  }
}
