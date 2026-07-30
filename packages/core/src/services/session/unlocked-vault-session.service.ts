import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSession,
  UnlockedVaultSessionMaterial,
} from "../../domain/session/unlocked-vault-session.type";
import type { Vault } from "../../domain/vault/vault";
import { compareVersionVectors } from "../../domain/versioning/version-vector.utils";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/session/encrypted-unlocked-vault-session-payload-repository.port";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/session/unlocked-vault-session-material-repository.port";
import {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionExpiredError,
  UnlockedVaultSessionInvalidError,
  VaultMustBeUnlockedError,
} from "../../errors/vault-session.errors";

export class UnlockedVaultSessionService {
  private readonly materialRepository: UnlockedVaultSessionMaterialRepositoryPort;
  private readonly encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort;
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;
  private pendingSessionOperation: Promise<void> = Promise.resolve();
  private activationGeneration = 0;
  private sessionIsInvalidated = false;

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

  async requireVaultCanBeActivated(vaultId: string): Promise<number> {
    return this.serializeSessionOperation(async () => {
      const storedMaterial =
        await this.materialRepository.getUnlockedVaultSessionMaterial();
      const activeMaterial = this.getActiveMaterial(storedMaterial);

      if (activeMaterial !== null && activeMaterial.vaultId !== vaultId) {
        throw new ActiveUnlockedVaultMismatchError(
          activeMaterial.vaultId,
          vaultId,
        );
      }

      return this.activationGeneration;
    });
  }

  async get(): Promise<UnlockedVaultSession | null> {
    return this.serializeSessionOperation(async () => this.restoreSession());
  }

  async requireUnlockedVaultContext(
    vaultId: string,
    operation: string,
  ): Promise<UnlockedVaultSession> {
    return this.serializeSessionOperation(async () => {
      const unlockedVaultSession = await this.restoreSession();

      if (
        unlockedVaultSession === null ||
        unlockedVaultSession.unlockedVault.vaultId !== vaultId
      ) {
        throw new VaultMustBeUnlockedError(vaultId, operation);
      }

      return unlockedVaultSession;
    });
  }

  async persistForActiveSession<T>(
    sessionId: string,
    vaultId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.serializeSessionOperation(async () => {
      this.requireActiveSession(
        await this.materialRepository.getUnlockedVaultSessionMaterial(),
        sessionId,
        vaultId,
      );

      return operation();
    });
  }

  async restorePersistedState(
    sessionId: string,
    vaultId: string,
    restore: () => Promise<void>,
  ): Promise<boolean> {
    return this.serializeSessionOperation(async () => {
      try {
        await restore();
      } catch {
        await this.removeSessionRecordsPreservingRootCause();
        return false;
      }

      const activeMaterial = this.getActiveMaterial(
        await this.materialRepository.getUnlockedVaultSessionMaterial(),
      );

      if (
        activeMaterial !== null &&
        !this.isActiveSession(activeMaterial, sessionId, vaultId)
      ) {
        await this.removeSessionRecordsPreservingRootCause();
      }

      return true;
    });
  }

  async discardIfSessionIsActive(
    sessionId: string,
    vaultId: string,
    discard: () => Promise<void>,
  ): Promise<boolean> {
    return this.serializeSessionOperation(async () => {
      const activeMaterial =
        await this.materialRepository.getUnlockedVaultSessionMaterial();

      if (!this.isActiveSession(activeMaterial, sessionId, vaultId)) {
        return false;
      }

      try {
        await this.removeSessionRecords();
      } catch {
        return false;
      }

      try {
        await discard();
        return true;
      } catch {
        return false;
      }
    });
  }

  async activate(
    activationGeneration: number,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
  ): Promise<string> {
    return this.serializeSessionOperation(async () => {
      if (activationGeneration !== this.activationGeneration) {
        throw new UnlockedVaultSessionExpiredError(unlockedVault.vaultId);
      }

      const storedMaterial =
        await this.materialRepository.getUnlockedVaultSessionMaterial();
      const activeMaterial = this.getActiveMaterial(storedMaterial);

      if (
        activeMaterial !== null &&
        activeMaterial.vaultId !== unlockedVault.vaultId
      ) {
        throw new ActiveUnlockedVaultMismatchError(
          activeMaterial.vaultId,
          unlockedVault.vaultId,
        );
      }

      const protectedSession = await this.protect(
        {
          unlockedVault,
          sourceSnapshotVersionVector,
        },
        activeMaterial ?? undefined,
      );

      try {
        await this.persistProtectedSession(protectedSession);
      } catch (error) {
        await this.removeSessionRecordsPreservingRootCause();
        throw error;
      }

      this.sessionIsInvalidated = false;
      this.activationGeneration += 1;
      return protectedSession.material.sessionId;
    });
  }

  async commitPersistedSnapshot(
    sessionId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
  ): Promise<void> {
    await this.serializeSessionOperation(async () => {
      const activeMaterial = this.requireActiveSession(
        await this.materialRepository.getUnlockedVaultSessionMaterial(),
        sessionId,
        unlockedVault.vaultId,
      );

      try {
        const protectedSession = await this.protect(
          {
            unlockedVault,
            sourceSnapshotVersionVector,
          },
          activeMaterial,
        );
        await this.persistProtectedSession(protectedSession);
      } catch (error) {
        await this.removeSessionRecordsPreservingRootCause();
        throw error;
      }
    });
  }

  async remove(): Promise<void> {
    await this.serializeSessionOperation(async () => {
      await this.removeSessionRecords();
    });
  }

  private async restoreSession(): Promise<UnlockedVaultSession | null> {
    const storedMaterial =
      await this.materialRepository.getUnlockedVaultSessionMaterial();
    const material = this.getActiveMaterial(storedMaterial);

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

  private async removeSessionRecords(): Promise<void> {
    this.activationGeneration += 1;
    this.sessionIsInvalidated = true;

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

  private async persistProtectedSession(protectedSession: {
    readonly material: UnlockedVaultSessionMaterial;
    readonly encryptedPayload: EncryptedUnlockedVaultSessionPayload;
  }): Promise<void> {
    await this.encryptedPayloadRepository.saveEncryptedUnlockedVaultSessionPayload(
      protectedSession.encryptedPayload,
    );
    await this.materialRepository.saveUnlockedVaultSessionMaterial(
      protectedSession.material,
    );
  }

  private async protect(
    session: Pick<
      UnlockedVaultSession,
      "unlockedVault" | "sourceSnapshotVersionVector"
    >,
    activeMaterial?: Pick<
      UnlockedVaultSessionMaterial,
      "sessionId" | "payloadKey"
    >,
  ): Promise<{
    readonly material: UnlockedVaultSessionMaterial;
    readonly encryptedPayload: EncryptedUnlockedVaultSessionPayload;
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
        devicePrivateVaultKey: unlockedVault.devicePrivateVaultKey,
        deviceLocalProtectionKey: unlockedVault.deviceLocalProtectionKey,
        trustedSnapshotContext: unlockedVault.trustedSnapshotContext,
        vaultTrustAnchor: unlockedVault.vaultTrustAnchor,
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
      sessionId: material.sessionId,
      unlockedVault: {
        vaultId: material.vaultId,
        deviceId: material.deviceId,
        vault: payload.vault,
        vaultMasterKey: material.vaultMasterKey,
        devicePrivateSignKey: material.devicePrivateSignKey,
        devicePrivateVaultKey: material.devicePrivateVaultKey,
        deviceLocalProtectionKey: material.deviceLocalProtectionKey,
        trustedSnapshotContext: material.trustedSnapshotContext,
        vaultTrustAnchor: material.vaultTrustAnchor,
      },
      sourceSnapshotVersionVector: encryptedPayload.sourceSnapshotVersionVector,
    };
  }

  private async removeSessionRecordsPreservingRootCause(): Promise<void> {
    try {
      await this.removeSessionRecords();
    } catch {
      // Preserve the original failure as the root cause.
    }
  }

  private async serializeSessionOperation<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const previousOperation = this.pendingSessionOperation;
    let completeOperation!: () => void;
    this.pendingSessionOperation = new Promise<void>((resolve) => {
      completeOperation = resolve;
    });

    await previousOperation;

    try {
      return await operation();
    } finally {
      completeOperation();
    }
  }

  private requireActiveSession(
    activeMaterial: UnlockedVaultSessionMaterial | null,
    sessionId: string,
    vaultId: string,
  ): UnlockedVaultSessionMaterial {
    if (
      activeMaterial === null ||
      !this.isActiveSession(activeMaterial, sessionId, vaultId)
    ) {
      throw new UnlockedVaultSessionExpiredError(vaultId);
    }

    return activeMaterial;
  }

  private isActiveSession(
    activeMaterial: UnlockedVaultSessionMaterial | null,
    sessionId: string,
    vaultId: string,
  ): boolean {
    return (
      activeMaterial !== null &&
      !this.sessionIsInvalidated &&
      activeMaterial.sessionId === sessionId &&
      activeMaterial.vaultId === vaultId
    );
  }

  private getActiveMaterial(
    material: UnlockedVaultSessionMaterial | null,
  ): UnlockedVaultSessionMaterial | null {
    return this.sessionIsInvalidated ? null : material;
  }

  private requireMatchingSessionRecords(
    material: Pick<
      UnlockedVaultSessionMaterial,
      "sessionId" | "vaultId" | "sourceSnapshotVersionVector"
    >,
    encryptedPayload: Pick<
      EncryptedUnlockedVaultSessionPayload,
      "sessionId" | "vaultId" | "sourceSnapshotVersionVector"
    >,
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
