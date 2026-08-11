import type {
  UnlockedVaultSessionMaterial,
  UnlockedVaultSessionMaterialRepositoryPort,
} from "@lfspm/core";
import {
  deserializeUnlockedVaultSessionMaterial,
  serializeUnlockedVaultSessionMaterial,
} from "./unlocked-vault-session-material.codec";

export const UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY =
  "unlockedVaultSessionMaterial";

export type ChromeStorageArea = {
  get: (keys?: unknown) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

export class ChromeUnlockedVaultSessionMaterialRepository implements UnlockedVaultSessionMaterialRepositoryPort {
  private readonly storageArea: ChromeStorageArea;
  private readonly storageKey: string;
  private cachedMaterial: UnlockedVaultSessionMaterial | null | undefined;
  private pendingOperation: Promise<void> = Promise.resolve();

  constructor(
    storageArea: ChromeStorageArea = chrome.storage
      .session as ChromeStorageArea,
    storageKey = UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
  ) {
    this.storageArea = storageArea;
    this.storageKey = storageKey;
  }

  async saveUnlockedVaultSessionMaterial(
    material: UnlockedVaultSessionMaterial,
  ): Promise<void> {
    await this.serializeOperation(async () => {
      await this.storageArea.set({
        [this.storageKey]: serializeUnlockedVaultSessionMaterial(material),
      });
      this.cachedMaterial = material;
    });
  }

  async getUnlockedVaultSessionMaterial(): Promise<UnlockedVaultSessionMaterial | null> {
    return this.serializeOperation(async () => {
      if (this.cachedMaterial !== undefined) {
        return this.cachedMaterial;
      }

      const storedRecords = await this.storageArea.get(this.storageKey);
      const material = storedRecords[this.storageKey];

      if (material === undefined) {
        return null;
      }

      const decodedMaterial = deserializeUnlockedVaultSessionMaterial(material);
      this.cachedMaterial = decodedMaterial;
      return decodedMaterial;
    });
  }

  async removeUnlockedVaultSessionMaterial(): Promise<void> {
    await this.serializeOperation(async () => {
      try {
        await this.storageArea.remove(this.storageKey);
      } finally {
        this.cachedMaterial = null;
      }
    });
  }

  private serializeOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pendingOperation.then(operation, operation);
    this.pendingOperation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
