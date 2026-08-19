import type {
  EncryptedUnlockedVaultSessionPayload,
  EncryptedUnlockedVaultSessionPayloadRepositoryPort,
} from "@lfspm/core";
import {
  ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
  db,
  type VaultManagerDb,
} from "../../infrastructure/database/dexie-db";
import {
  decodeEncryptedUnlockedVaultSessionPayload,
  InvalidUnlockedVaultSessionPayloadRecordError,
} from "../codecs/unlocked-session-payload.codec";
import { exactRecord } from "../codecs/artifact-codec.primitives";

const STORED_RECORD_KEYS = [
  "content",
  "id",
  "sessionId",
  "sourceSnapshotVersionVector",
  "vaultId",
] as const;

export class IndexedDbEncryptedUnlockedVaultSessionPayloadRepository implements EncryptedUnlockedVaultSessionPayloadRepositoryPort {
  private readonly database: VaultManagerDb;

  constructor(database: VaultManagerDb = db) {
    this.database = database;
  }

  async saveEncryptedUnlockedVaultSessionPayload(
    encryptedPayload: EncryptedUnlockedVaultSessionPayload,
  ): Promise<void> {
    await this.database.encryptedUnlockedVaultSessionPayloads.put({
      id: ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
      ...encryptedPayload,
    });
  }

  async getEncryptedUnlockedVaultSessionPayload(): Promise<EncryptedUnlockedVaultSessionPayload | null> {
    const record =
      await this.database.encryptedUnlockedVaultSessionPayloads.get(
        ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
      );

    if (record === undefined) {
      return null;
    }

    let stored: Record<string, unknown>;
    try {
      stored = exactRecord(record, STORED_RECORD_KEYS);
    } catch {
      throw new InvalidUnlockedVaultSessionPayloadRecordError();
    }
    if (stored.id !== ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID) {
      throw new InvalidUnlockedVaultSessionPayloadRecordError();
    }

    return decodeEncryptedUnlockedVaultSessionPayload({
      sessionId: stored.sessionId,
      vaultId: stored.vaultId,
      sourceSnapshotVersionVector: stored.sourceSnapshotVersionVector,
      content: stored.content,
    });
  }

  async removeEncryptedUnlockedVaultSessionPayload(): Promise<void> {
    await this.database.encryptedUnlockedVaultSessionPayloads.delete(
      ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
    );
  }
}
