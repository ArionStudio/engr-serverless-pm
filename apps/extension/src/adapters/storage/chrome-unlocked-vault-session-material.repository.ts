import type {
  DevicePrivateSignKey,
  UnlockedVaultSessionMaterialRepositoryPort,
  UnlockedVaultSessionPayloadKey,
  VaultMasterKey,
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

  constructor(
    storageArea: ChromeStorageArea = chrome.storage
      .session as ChromeStorageArea,
    storageKey = UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
  ) {
    this.storageArea = storageArea;
    this.storageKey = storageKey;
  }

  async saveUnlockedVaultSessionMaterial(material: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly sourceSnapshotRevision: number;
    readonly deviceId: string;
    readonly vaultMasterKey: VaultMasterKey;
    readonly devicePrivateSignKey: DevicePrivateSignKey;
    readonly payloadKey: UnlockedVaultSessionPayloadKey;
  }): Promise<void> {
    await this.storageArea.set({
      [this.storageKey]: serializeUnlockedVaultSessionMaterial(material),
    });
  }

  async getUnlockedVaultSessionMaterial(): Promise<{
    readonly sessionId: string;
    readonly vaultId: string;
    readonly sourceSnapshotRevision: number;
    readonly deviceId: string;
    readonly vaultMasterKey: VaultMasterKey;
    readonly devicePrivateSignKey: DevicePrivateSignKey;
    readonly payloadKey: UnlockedVaultSessionPayloadKey;
  } | null> {
    const storedRecords = await this.storageArea.get(this.storageKey);
    const material = storedRecords[this.storageKey];

    if (material === undefined) {
      return null;
    }

    return deserializeUnlockedVaultSessionMaterial(material);
  }

  async removeUnlockedVaultSessionMaterial(): Promise<void> {
    await this.storageArea.remove(this.storageKey);
  }
}
