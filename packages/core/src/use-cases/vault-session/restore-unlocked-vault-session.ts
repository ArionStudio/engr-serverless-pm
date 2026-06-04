import type { CryptoPort } from "../../ports/crypto/crypto.port";
import { UnlockedVaultSessionInvalidError } from "../__errors/vault-session.errors";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSession,
  UnlockedVaultSessionMaterial,
  UnlockedVaultSessionPayloadEncryptionContext,
} from "../../domain/vault/unlocked-vault-session";

export type RestoreUnlockedVaultSessionCommandParams = {
  readonly material: UnlockedVaultSessionMaterial;
  readonly encryptedPayload: EncryptedUnlockedVaultSessionPayload;
};

export class RestoreUnlockedVaultSessionUseCase {
  private readonly crypto: CryptoPort;

  constructor(crypto: CryptoPort) {
    this.crypto = crypto;
  }

  async execute(
    params: RestoreUnlockedVaultSessionCommandParams,
  ): Promise<UnlockedVaultSession> {
    assertMatchingSessionRecords(params.material, params.encryptedPayload);

    const context: UnlockedVaultSessionPayloadEncryptionContext = {
      sessionId: params.encryptedPayload.sessionId,
      vaultId: params.encryptedPayload.vaultId,
      sourceSnapshotRevision: params.encryptedPayload.sourceSnapshotRevision,
    };

    let payload;

    try {
      payload = await this.crypto.decryptUnlockedVaultSessionPayload(
        params.encryptedPayload.content,
        params.material.payloadKey,
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
        vaultId: params.material.vaultId,
        deviceId: params.material.deviceId,
        vault: payload.vault,
        vaultMasterKey: params.material.vaultMasterKey,
        devicePrivateSignKey: params.material.devicePrivateSignKey,
      },
      sourceSnapshotRevision: params.encryptedPayload.sourceSnapshotRevision,
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
}
