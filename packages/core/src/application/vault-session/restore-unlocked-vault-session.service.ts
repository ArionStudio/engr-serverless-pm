import type { CryptoPort } from "../../ports/crypto/crypto.port";
import { UnlockedVaultSessionInvalidError } from "../errors/vault-session.errors";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSession,
  UnlockedVaultSessionMaterial,
  UnlockedVaultSessionPayloadEncryptionContext,
} from "../../domain/vault/unlocked-vault-session";

export class RestoreUnlockedVaultSessionService {
  private readonly crypto: CryptoPort;

  constructor(crypto: CryptoPort) {
    this.crypto = crypto;
  }

  async restore(
    material: UnlockedVaultSessionMaterial,
    encryptedPayload: EncryptedUnlockedVaultSessionPayload,
  ): Promise<UnlockedVaultSession> {
    assertMatchingSessionRecords(material, encryptedPayload);

    const context: UnlockedVaultSessionPayloadEncryptionContext = {
      sessionId: encryptedPayload.sessionId,
      vaultId: encryptedPayload.vaultId,
      sourceSnapshotRevision: encryptedPayload.sourceSnapshotRevision,
    };

    let payload;

    try {
      payload = await this.crypto.decryptUnlockedVaultSessionPayload(
        encryptedPayload.content,
        material.payloadKey,
        context,
      );
    } catch (error) {
      throw new UnlockedVaultSessionInvalidError(
        "encrypted payload cannot be decrypted",
        { cause: error },
      );
    }

    return {
      unlockedVault: {
        vaultId: material.vaultId,
        deviceId: material.deviceId,
        vault: payload.vault,
        vaultMasterKey: material.vaultMasterKey,
        devicePrivateSignKey: material.devicePrivateSignKey,
      },
      sourceSnapshotRevision: encryptedPayload.sourceSnapshotRevision,
    };
  }
}

function assertMatchingSessionRecords(
  material: UnlockedVaultSessionMaterial,
  encryptedPayload: EncryptedUnlockedVaultSessionPayload,
): void {
  if (
    material.sessionId !== encryptedPayload.sessionId ||
    material.vaultId !== encryptedPayload.vaultId
  ) {
    throw new UnlockedVaultSessionInvalidError(
      "session material does not match encrypted payload",
    );
  }

  if (
    encryptedPayload.sourceSnapshotRevision < material.sourceSnapshotRevision
  ) {
    throw new UnlockedVaultSessionInvalidError(
      "encrypted payload is older than session material",
    );
  }
}
