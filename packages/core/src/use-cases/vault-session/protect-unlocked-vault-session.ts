import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type {
  ProtectedUnlockedVaultSession,
  UnlockedVaultSession,
  UnlockedVaultSessionMaterial,
  UnlockedVaultSessionPayloadEncryptionContext,
} from "../../domain/vault/unlocked-vault-session";

export type ProtectUnlockedVaultSessionCommandParams = {
  readonly session: UnlockedVaultSession;
  readonly activeMaterial?: Pick<
    UnlockedVaultSessionMaterial,
    "sessionId" | "payloadKey"
  >;
};

export class ProtectUnlockedVaultSessionUseCase {
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;

  constructor(crypto: CryptoPort, ids: IdPort) {
    this.crypto = crypto;
    this.ids = ids;
  }

  async execute(
    params: ProtectUnlockedVaultSessionCommandParams,
  ): Promise<ProtectedUnlockedVaultSession> {
    const sessionId =
      params.activeMaterial?.sessionId ?? (await this.ids.generateId());
    const payloadKey =
      params.activeMaterial?.payloadKey ??
      (await this.crypto.generateUnlockedVaultSessionPayloadKey());
    const { unlockedVault, sourceSnapshotRevision } = params.session;
    const context: UnlockedVaultSessionPayloadEncryptionContext = {
      sessionId,
      vaultId: unlockedVault.vaultId,
      sourceSnapshotRevision,
    };
    const content = await this.crypto.encryptUnlockedVaultSessionPayload(
      {
        vault: unlockedVault.vault,
      },
      payloadKey,
      context,
    );

    return {
      material: {
        ...context,
        deviceId: unlockedVault.deviceId,
        vaultMasterKey: unlockedVault.vaultMasterKey,
        devicePrivateSignKey: unlockedVault.devicePrivateSignKey,
        payloadKey,
      },
      encryptedPayload: {
        ...context,
        content,
      },
    };
  }
}
