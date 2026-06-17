import type { SerializedEncrypted } from "../../domain/crypto/protected-artifact";
import type { DevicePrivateSignKey } from "../../domain/device-trust/brand-keys";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { UnlockedVaultSessionPayloadKey } from "../../domain/session/unlocked-vault-session-payload-key";
import type { VaultMasterKey } from "../../domain/snapshot/brand-keys";
import type { Vault } from "../../domain/vault/vault";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import { compareVersionVectors } from "../../domain/versioning/version-vector.utils";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/session/encrypted-unlocked-vault-session-payload-repository.port";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/session/unlocked-vault-session-material-repository.port";
import {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionInvalidError,
  VaultMustBeUnlockedError,
} from "../../errors/vault-session.errors";

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

  async requireVaultCanBeActivated(vaultId: string): Promise<void> {
    const activeMaterial =
      await this.materialRepository.getUnlockedVaultSessionMaterial();

    if (activeMaterial !== null && activeMaterial.vaultId !== vaultId) {
      throw new ActiveUnlockedVaultMismatchError(
        activeMaterial.vaultId,
        vaultId,
      );
    }
  }

  async get(): Promise<{
    readonly unlockedVault: UnlockedVault;
    readonly sourceSnapshotVersionVector: VersionVector;
  } | null> {
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

  async requireUnlockedVaultContext(
    vaultId: string,
    operation: string,
  ): Promise<{
    readonly unlockedVault: UnlockedVault;
    readonly sourceSnapshotVersionVector: VersionVector;
  }> {
    const unlockedVaultSession = await this.get();

    if (
      unlockedVaultSession === null ||
      unlockedVaultSession.unlockedVault.vaultId !== vaultId
    ) {
      throw new VaultMustBeUnlockedError(vaultId, operation);
    }

    return {
      unlockedVault: unlockedVaultSession.unlockedVault,
      sourceSnapshotVersionVector:
        unlockedVaultSession.sourceSnapshotVersionVector,
    };
  }

  async commit(
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
  ): Promise<void> {
    await this.save({
      unlockedVault,
      sourceSnapshotVersionVector,
    });
  }

  async commitPersistedSnapshot(
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
  ): Promise<void> {
    try {
      await this.commit(unlockedVault, sourceSnapshotVersionVector);
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

  private async save(session: {
    readonly unlockedVault: UnlockedVault;
    readonly sourceSnapshotVersionVector: VersionVector;
  }): Promise<void> {
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
    session: {
      readonly unlockedVault: UnlockedVault;
      readonly sourceSnapshotVersionVector: VersionVector;
    },
    activeMaterial?: {
      readonly sessionId: string;
      readonly payloadKey: UnlockedVaultSessionPayloadKey;
    },
  ): Promise<{
    readonly material: {
      readonly sessionId: string;
      readonly vaultId: string;
      readonly sourceSnapshotVersionVector: VersionVector;
      readonly deviceId: string;
      readonly vaultMasterKey: VaultMasterKey;
      readonly devicePrivateSignKey: DevicePrivateSignKey;
      readonly payloadKey: UnlockedVaultSessionPayloadKey;
    };
    readonly encryptedPayload: {
      readonly sessionId: string;
      readonly vaultId: string;
      readonly sourceSnapshotVersionVector: VersionVector;
      readonly content: SerializedEncrypted<{
        readonly vault: Vault;
      }>;
    };
  }> {
    const sessionId =
      activeMaterial?.sessionId ?? (await this.ids.generateId());
    const payloadKey =
      activeMaterial?.payloadKey ??
      (await this.crypto.generateUnlockedVaultSessionPayloadKey());
    const { unlockedVault, sourceSnapshotVersionVector } = session;
    const context = {
      sessionId,
      vaultId: unlockedVault.vaultId,
      sourceSnapshotVersionVector,
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
    material: {
      readonly sessionId: string;
      readonly vaultId: string;
      readonly sourceSnapshotVersionVector: VersionVector;
      readonly deviceId: string;
      readonly vaultMasterKey: VaultMasterKey;
      readonly devicePrivateSignKey: DevicePrivateSignKey;
      readonly payloadKey: UnlockedVaultSessionPayloadKey;
    },
    encryptedPayload: {
      readonly sessionId: string;
      readonly vaultId: string;
      readonly sourceSnapshotVersionVector: VersionVector;
      readonly content: SerializedEncrypted<{
        readonly vault: Vault;
      }>;
    },
  ): Promise<{
    readonly unlockedVault: UnlockedVault;
    readonly sourceSnapshotVersionVector: VersionVector;
  }> {
    this.requireMatchingSessionRecords(material, encryptedPayload);

    const context = {
      sessionId: encryptedPayload.sessionId,
      vaultId: encryptedPayload.vaultId,
      sourceSnapshotVersionVector: encryptedPayload.sourceSnapshotVersionVector,
    };

    let payload: {
      readonly vault: Vault;
    };

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
      sourceSnapshotVersionVector: encryptedPayload.sourceSnapshotVersionVector,
    };
  }

  private async removePreservingRootCause(): Promise<void> {
    try {
      await this.remove();
    } catch {
      // Preserve the original failure as the root cause.
    }
  }

  private requireMatchingSessionRecords(
    material: {
      readonly sessionId: string;
      readonly vaultId: string;
      readonly sourceSnapshotVersionVector: VersionVector;
    },
    encryptedPayload: {
      readonly sessionId: string;
      readonly vaultId: string;
      readonly sourceSnapshotVersionVector: VersionVector;
    },
  ): void {
    if (
      material.sessionId !== encryptedPayload.sessionId ||
      material.vaultId !== encryptedPayload.vaultId
    ) {
      throw new UnlockedVaultSessionInvalidError(
        "session material does not match encrypted payload",
      );
    }

    const relation = compareVersionVectors(
      encryptedPayload.sourceSnapshotVersionVector,
      material.sourceSnapshotVersionVector,
    );

    if (relation !== "equal" && relation !== "local_ahead") {
      throw new UnlockedVaultSessionInvalidError(
        "encrypted payload is older than session material",
      );
    }
  }
}
