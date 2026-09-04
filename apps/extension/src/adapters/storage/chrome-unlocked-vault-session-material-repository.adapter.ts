import type {
  UnlockedVaultSessionMaterial,
  UnlockedVaultSessionMaterialRepositoryPort,
} from "@lfspm/core";
import {
  WebCryptoAsymmetricKeyValidator,
  type AsymmetricKeyValidator,
} from "../crypto";
import {
  deserializeUnlockedVaultSessionIdentity,
  deserializeUnlockedVaultSessionMaterial,
  serializeUnlockedVaultSessionMaterial,
} from "./unlocked-vault-session-material.codec";
import type { ChromeStorageArea } from "./chrome-storage-area.type";

export const UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY =
  "unlockedVaultSessionMaterial";
export const UNLOCKED_VAULT_SESSION_EPOCH_STORAGE_KEY =
  "unlockedVaultSessionEpoch";

export class ChromeUnlockedVaultSessionMaterialRepositoryAdapter implements UnlockedVaultSessionMaterialRepositoryPort {
  private readonly storageArea: ChromeStorageArea;
  private readonly storageKey: string;
  private readonly epochStorageKey: string;
  private readonly asymmetricKeyValidator: AsymmetricKeyValidator;
  private cachedMaterial: UnlockedVaultSessionMaterial | null | undefined;
  private pendingOperation: Promise<void> = Promise.resolve();

  constructor(
    storageArea: ChromeStorageArea = chrome.storage
      .session as ChromeStorageArea,
    storageKey = UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
    epochStorageKey = UNLOCKED_VAULT_SESSION_EPOCH_STORAGE_KEY,
    asymmetricKeyValidator: AsymmetricKeyValidator = new WebCryptoAsymmetricKeyValidator(),
  ) {
    this.storageArea = storageArea;
    this.storageKey = storageKey;
    this.epochStorageKey = epochStorageKey;
    this.asymmetricKeyValidator = asymmetricKeyValidator;
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

      const decodedMaterial = await deserializeUnlockedVaultSessionMaterial(
        material,
        this.asymmetricKeyValidator,
      );
      this.cachedMaterial = decodedMaterial;
      return decodedMaterial;
    });
  }

  async getPersistedUnlockedVaultSessionIdentity(): Promise<Pick<
    UnlockedVaultSessionMaterial,
    "sessionId" | "vaultId" | "sourceSnapshotVersionVector"
  > | null> {
    return this.serializeOperation(async () => {
      const storedRecords = await this.storageArea.get(this.storageKey);
      const material = storedRecords[this.storageKey];

      return material === undefined
        ? null
        : await deserializeUnlockedVaultSessionIdentity(
            material,
            this.asymmetricKeyValidator,
          );
    });
  }

  async getUnlockedVaultSessionEpoch(): Promise<number> {
    return this.serializeOperation(() => this.readUnlockedVaultSessionEpoch());
  }

  async advanceUnlockedVaultSessionEpoch(): Promise<void> {
    await this.serializeOperation(async () => {
      const currentEpoch = await this.readUnlockedVaultSessionEpoch();

      if (currentEpoch === Number.MAX_SAFE_INTEGER) {
        throw new Error("Unlocked vault session epoch is exhausted.");
      }

      await this.storageArea.set({
        [this.epochStorageKey]: currentEpoch + 1,
      });
    });
  }

  async evictCachedUnlockedVaultSessionMaterial(
    sessionId: string | null,
  ): Promise<void> {
    await this.serializeOperation(async () => {
      if (
        this.cachedMaterial === null ||
        (sessionId !== null && this.cachedMaterial?.sessionId === sessionId)
      ) {
        this.cachedMaterial = undefined;
      }
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

  private async readUnlockedVaultSessionEpoch(): Promise<number> {
    const storedRecords = await this.storageArea.get(this.epochStorageKey);
    const epoch = storedRecords[this.epochStorageKey];

    if (epoch === undefined) {
      return 0;
    }

    if (
      typeof epoch !== "number" ||
      !Number.isSafeInteger(epoch) ||
      epoch < 0
    ) {
      throw new Error("Unlocked vault session epoch is malformed.");
    }

    return epoch;
  }
}
