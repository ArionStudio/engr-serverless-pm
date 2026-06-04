import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type {
  ProtectedUnlockedVaultSession,
  UnlockedVaultSession,
  UnlockedVaultSessionMaterial,
  UnlockedVaultSessionPayloadEncryptionContext,
} from "../../domain/vault/unlocked-vault-session";

export class ProtectUnlockedVaultSessionService {
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;

  constructor(crypto: CryptoPort, ids: IdPort) {
    this.crypto = crypto;
    this.ids = ids;
  }

  async protect(
    session: UnlockedVaultSession,
    activeMaterial?: Pick<
      UnlockedVaultSessionMaterial,
      "sessionId" | "payloadKey"
    >,
  ): Promise<ProtectedUnlockedVaultSession> {
    const sessionId =
      activeMaterial?.sessionId ?? (await this.ids.generateId());
    const payloadKey =
      activeMaterial?.payloadKey ??
      (await this.crypto.generateUnlockedVaultSessionPayloadKey());
    const { unlockedVault, sourceSnapshotRevision } = session;
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
