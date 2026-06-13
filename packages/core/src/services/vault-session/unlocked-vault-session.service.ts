import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import type {
  EncryptedUnlockedVaultSessionPayload,
  ProtectedUnlockedVaultSession,
  UnlockedVaultSession,
  UnlockedVaultSessionMaterial,
  UnlockedVaultSessionPayloadEncryptionContext,
} from "../../domain/vault/unlocked-vault-session";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/vault/encrypted-unlocked-vault-session-payload-repository.port";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/vault/unlocked-vault-session-material-repository.port";
import {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionInvalidError,
  VaultMustBeUnlockedError,
} from "../../errors/vault-session.errors";

export type UnlockedVaultContext = Pick<
  UnlockedVaultSession,
  "unlockedVault" | "sourceSnapshotRevision"
>;

export class UnlockedVaultSessionService {
  private readonly materialRepository: UnlockedVaultSessionMaterialRepositoryPort;
  private readonly encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort;
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;

  constructor(
    materialRepository: UnlockedVaultSessionMaterialRepositoryPort,
    encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort,
    crypto: CryptoPort,
    ids: IdPort,
  ) {
    this.materialRepository = materialRepository;
    this.encryptedPayloadRepository = encryptedPayloadRepository;
    this.crypto = crypto;
    this.ids = ids;
  }

  async assertCanActivate(vaultId: string): Promise<void> {
    const activeMaterial =
      await this.materialRepository.getUnlockedVaultSessionMaterial();

    if (activeMaterial !== null && activeMaterial.vaultId !== vaultId) {
      throw new ActiveUnlockedVaultMismatchError(
        activeMaterial.vaultId,
        vaultId,
      );
    }
  }

  async get(): Promise<UnlockedVaultSession | null> {
    const material =
      await this.materialRepository.getUnlockedVaultSessionMaterial();

    if (material === null) {
      return null;
    }

    const encryptedPayload =
      await this.encryptedPayloadRepository.getEncryptedUnlockedVaultSessionPayload();

    if (encryptedPayload === null) {
      throw new UnlockedVaultSessionInvalidError(
        "encrypted payload is missing",
      );
    }

    return this.restore(material, encryptedPayload);
  }

  async getUnlockedVaultContext(
    vaultId: string,
    operation: string,
  ): Promise<UnlockedVaultContext> {
    const unlockedVaultSession = await this.get();

    if (
      unlockedVaultSession === null ||
      unlockedVaultSession.unlockedVault.vaultId !== vaultId
    ) {
      throw new VaultMustBeUnlockedError(vaultId, operation);
    }

    return {
      unlockedVault: unlockedVaultSession.unlockedVault,
      sourceSnapshotRevision: unlockedVaultSession.sourceSnapshotRevision,
    };
  }

  async commit(
    unlockedVault: UnlockedVault,
    sourceSnapshotRevision: number,
  ): Promise<void> {
    await this.save({
      unlockedVault,
      sourceSnapshotRevision,
    });
  }

  async commitPersistedSnapshot(
    unlockedVault: UnlockedVault,
    sourceSnapshotRevision: number,
  ): Promise<void> {
    try {
      await this.commit(unlockedVault, sourceSnapshotRevision);
    } catch (error) {
      if (!(error instanceof ActiveUnlockedVaultMismatchError)) {
        await this.removePreservingRootCause();
      }

      throw error;
    }
  }

  async remove(): Promise<void> {
    let removalError: unknown;

    try {
      await this.materialRepository.removeUnlockedVaultSessionMaterial();
    } catch (error) {
      removalError = error;
    }

    try {
      await this.encryptedPayloadRepository.removeEncryptedUnlockedVaultSessionPayload();
    } catch (error) {
      if (removalError === undefined) {
        removalError = error;
      }
    }

    if (removalError !== undefined) {
      throw removalError;
    }
  }

  private async save(session: UnlockedVaultSession): Promise<void> {
    const activeMaterial =
      await this.materialRepository.getUnlockedVaultSessionMaterial();
    const incomingVaultId = session.unlockedVault.vaultId;

    if (activeMaterial !== null && activeMaterial.vaultId !== incomingVaultId) {
      throw new ActiveUnlockedVaultMismatchError(
        activeMaterial.vaultId,
        incomingVaultId,
      );
    }

    const protectedSession = await this.protect(
      session,
      activeMaterial ?? undefined,
    );

    try {
      await this.encryptedPayloadRepository.saveEncryptedUnlockedVaultSessionPayload(
        protectedSession.encryptedPayload,
      );
      await this.materialRepository.saveUnlockedVaultSessionMaterial(
        protectedSession.material,
      );
    } catch (error) {
      await this.removePreservingRootCause();
      throw error;
    }
  }

  private async protect(
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

  private async restore(
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

  private async removePreservingRootCause(): Promise<void> {
    try {
      await this.remove();
    } catch {
      // Preserve the original failure as the root cause.
    }
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
