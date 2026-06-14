import type {
  EncryptedUnlockedVaultSessionPayloadRepositoryPort,
  SerializedEncrypted,
  Vault,
} from "@lfspm/core";
import {
  ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
  db,
  type VaultManagerDb,
} from "../../infrastructure/database/dexie-db";

export class IndexedDbEncryptedUnlockedVaultSessionPayloadRepository implements EncryptedUnlockedVaultSessionPayloadRepositoryPort {
  private readonly database: VaultManagerDb;

  constructor(database: VaultManagerDb = db) {
    this.database = database;
  }

  async saveEncryptedUnlockedVaultSessionPayload(encryptedPayload: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly sourceSnapshotRevision: number;
    readonly content: SerializedEncrypted<{
      readonly vault: Vault;
    }>;
  }): Promise<void> {
    await this.database.encryptedUnlockedVaultSessionPayloads.put({
      id: ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
      ...encryptedPayload,
    });
  }

  async getEncryptedUnlockedVaultSessionPayload(): Promise<{
    readonly sessionId: string;
    readonly vaultId: string;
    readonly sourceSnapshotRevision: number;
    readonly content: SerializedEncrypted<{
      readonly vault: Vault;
    }>;
  } | null> {
    const record =
      await this.database.encryptedUnlockedVaultSessionPayloads.get(
        ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
      );

    if (record === undefined) {
      return null;
    }

    return {
      sessionId: record.sessionId,
      vaultId: record.vaultId,
      sourceSnapshotRevision: record.sourceSnapshotRevision,
      content: record.content,
    };
  }

  async removeEncryptedUnlockedVaultSessionPayload(): Promise<void> {
    await this.database.encryptedUnlockedVaultSessionPayloads.delete(
      ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
    );
  }
}
