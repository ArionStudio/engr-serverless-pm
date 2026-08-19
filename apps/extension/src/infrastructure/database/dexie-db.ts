import Dexie from "dexie";
import type { EntityTable } from "dexie";
import type { SerializedEncrypted, Vault, VersionVector } from "@lfspm/core";

export const DATABASE_NAME = "lfspm-extension";
export const STORAGE_SCHEMA_VERSION = 1;

export const STORE_NAMES = {
  LOCAL_VAULT_DESCRIPTORS: "localVaultDescriptors",
  DEVICE_ACCESS_MATERIALS: "deviceAccessMaterials",
  DEVICE_ACCESS_RECOVERY_BACKUPS: "deviceAccessRecoveryBackups",
  VAULT_SNAPSHOTS: "vaultSnapshots",
  LOCAL_VAULT_TRUST_CHECKPOINTS: "localVaultTrustCheckpoints",
  DEVICE_SYNC_CREDENTIAL_STATES: "deviceSyncCredentialStates",
  PENDING_DEVICE_ENROLLMENTS: "pendingDeviceEnrollments",
  ENCRYPTED_UNLOCKED_VAULT_SESSION_PAYLOADS:
    "encryptedUnlockedVaultSessionPayloads",
} as const;

export const ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID = "active";

export type EncryptedUnlockedVaultSessionPayloadRecord = {
  id: typeof ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID;
  sessionId: string;
  vaultId: string;
  sourceSnapshotVersionVector: VersionVector;
  content: SerializedEncrypted<{
    readonly vault: Vault;
  }>;
};

export type PersistedVaultArtifactRecord = {
  vaultId: string;
  artifact: unknown;
};

export type PersistedPendingDeviceEnrollmentRecord = {
  requestId: string;
  artifact: unknown;
};

export type VaultManagerDb = Dexie & {
  localVaultDescriptors: EntityTable<PersistedVaultArtifactRecord, "vaultId">;
  deviceAccessMaterials: EntityTable<PersistedVaultArtifactRecord, "vaultId">;
  deviceAccessRecoveryBackups: EntityTable<
    PersistedVaultArtifactRecord,
    "vaultId"
  >;
  vaultSnapshots: EntityTable<PersistedVaultArtifactRecord, "vaultId">;
  localVaultTrustCheckpoints: EntityTable<
    PersistedVaultArtifactRecord,
    "vaultId"
  >;
  deviceSyncCredentialStates: EntityTable<
    PersistedVaultArtifactRecord,
    "vaultId"
  >;
  pendingDeviceEnrollments: EntityTable<
    PersistedPendingDeviceEnrollmentRecord,
    "requestId"
  >;
  encryptedUnlockedVaultSessionPayloads: EntityTable<
    EncryptedUnlockedVaultSessionPayloadRecord,
    "id"
  >;
};

export function createVaultManagerDb(
  databaseName = DATABASE_NAME,
): VaultManagerDb {
  const db = new Dexie(databaseName) as VaultManagerDb;

  db.version(STORAGE_SCHEMA_VERSION).stores({
    [STORE_NAMES.LOCAL_VAULT_DESCRIPTORS]: "vaultId",
    [STORE_NAMES.DEVICE_ACCESS_MATERIALS]: "vaultId",
    [STORE_NAMES.DEVICE_ACCESS_RECOVERY_BACKUPS]: "vaultId",
    [STORE_NAMES.VAULT_SNAPSHOTS]: "vaultId",
    [STORE_NAMES.LOCAL_VAULT_TRUST_CHECKPOINTS]: "vaultId",
    [STORE_NAMES.DEVICE_SYNC_CREDENTIAL_STATES]: "vaultId",
    [STORE_NAMES.PENDING_DEVICE_ENROLLMENTS]: "requestId",
    [STORE_NAMES.ENCRYPTED_UNLOCKED_VAULT_SESSION_PAYLOADS]: "id",
  });

  return db;
}

export const db = createVaultManagerDb();
