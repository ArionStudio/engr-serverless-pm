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
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";

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
        const activeMaterial = this.getActiveMaterial(
          await this.materialRepository.getUnlockedVaultSessionMaterial(),
        );

        if (activeMaterial?.vaultId === vaultId) {
          await this.removeSessionRecordsPreservingRootCause(activeMaterial);
        }

        return false;
      }

      const activeMaterial = this.getActiveMaterial(
        await this.materialRepository.getUnlockedVaultSessionMaterial(),
      );

      if (
        activeMaterial !== null &&
        activeMaterial.vaultId === vaultId &&
        !this.isActiveSession(activeMaterial, sessionId, vaultId)
      ) {
        await this.removeSessionRecordsPreservingRootCause(activeMaterial);
      }

      return true;
    });
  }

  async discardIfSessionIsActive(
    sessionId: string,
    vaultId: string,
    generation: number,
    sourceSnapshotVersionVector: VersionVector,
    beforeRemoval: () => Promise<void>,
    discard: () => Promise<boolean>,
  ): Promise<
    | "discarded"
    | "session_advanced"
    | "session_replaced"
    | "session_unavailable"
    | "rollback_failed"
  > {
    return this.serializeSessionOperation(async () => {
      if (generation !== this.activationGeneration) {
        return "session_replaced";
      }

      const activeMaterial =
        await this.materialRepository.getUnlockedVaultSessionMaterial();

      if (
        activeMaterial === null ||
        !this.isActiveSession(activeMaterial, sessionId, vaultId)
      ) {
        return "session_unavailable";
      }

      if (
        compareVersionVectors(
          activeMaterial.sourceSnapshotVersionVector,
          sourceSnapshotVersionVector,
        ) !== "equal"
      ) {
        return "session_advanced";
      }

      let cleanupFailed = false;

      try {
        await beforeRemoval();
      } catch {
        cleanupFailed = true;
      }

      try {
        await this.removeSessionRecords(activeMaterial);
      } catch {
        return "rollback_failed";
      }

      if (cleanupFailed) {
        return "rollback_failed";
      }

      try {
        return (await discard()) ? "discarded" : "rollback_failed";
      } catch {
        return "rollback_failed";
      }
    });
  }

  async activate(
    activationGeneration: number,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
  ): Promise<string> {
    const activatedSession = await this.serializeSessionOperation(async () =>
      this.activateWithinSessionOperation(
        activationGeneration,
        unlockedVault,
        sourceSnapshotVersionVector,
      ),
    );

    return activatedSession.sessionId;
  }

  async activateWithAutoLock(
    activationGeneration: number,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
    installAutoLock: () => Promise<void>,
    rollbackAutoLock: () => Promise<void>,
  ): Promise<{ readonly sessionId: string; readonly generation: number }> {
    return this.serializeSessionOperation(async () => {
      let autoLockInstalled = false;

      try {
        return await this.activateWithinSessionOperation(
          activationGeneration,
          unlockedVault,
          sourceSnapshotVersionVector,
          async () => {
            await installAutoLock();
            autoLockInstalled = true;
          },
        );
      } catch (error) {
        if (autoLockInstalled) {
          try {
            await rollbackAutoLock();
          } catch {
            // The activation failure remains the root cause.
          }
        }

        throw error;
      }
    });
  }

  private async activateWithinSessionOperation(
    activationGeneration: number,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
    beforeActivation?: () => Promise<void>,
  ): Promise<{ readonly sessionId: string; readonly generation: number }> {
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

    try {
      await beforeActivation?.();

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
        this.wipeMaterial(protectedSession.material);
        await this.removeSessionRecordsPreservingRootCause(
          activeMaterial ?? undefined,
        );
        throw error;
      }

      if (activeMaterial !== null) {
        this.wipeReplacedMaterial(activeMaterial, protectedSession.material);
      }

      this.sessionIsInvalidated = false;
      this.activationGeneration += 1;
      return {
        sessionId: protectedSession.material.sessionId,
        generation: this.activationGeneration,
      };
    } catch (error) {
      if (activeMaterial !== null && !this.sessionIsInvalidated) {
        await this.removeSessionRecordsPreservingRootCause(activeMaterial);
      }

      throw error;
    }
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

      let protectedSession:
        | Awaited<ReturnType<UnlockedVaultSessionService["protect"]>>
        | undefined;

      try {
        protectedSession = await this.protect(
          {
            unlockedVault,
            sourceSnapshotVersionVector,
          },
          activeMaterial,
        );
        await this.persistProtectedSession(protectedSession);
        this.wipeReplacedMaterial(activeMaterial, protectedSession.material);
      } catch (error) {
        if (protectedSession !== undefined) {
          this.wipeMaterial(protectedSession.material);
        }
        await this.removeSessionRecordsPreservingRootCause(activeMaterial);
        throw error;
      }
    });
  }

  async remove(): Promise<void> {
    await this.serializeSessionOperation(async () => {
      await this.removeSessionRecords();
    });
  }

  async cleanupActiveSession(
    requiredVaultId: string | undefined,
    invalidateWhenUnavailable: boolean,
    beforeRemoval: (
      activeSession: {
        readonly sessionId: string;
        readonly vaultId: string;
        readonly generation: number;
      } | null,
    ) => Promise<boolean>,
  ): Promise<"removed" | "session_unavailable" | "stale_action"> {
    return this.serializeSessionOperation(async () => {
      let firstError: unknown;
      let material: UnlockedVaultSessionMaterial | null = null;
      let materialReadFailed = false;

      try {
        material = this.getActiveMaterial(
          await this.materialRepository.getUnlockedVaultSessionMaterial(),
        );
      } catch (error) {
        firstError = error;
        materialReadFailed = true;
      }

      if (
        !materialReadFailed &&
        requiredVaultId !== undefined &&
        material?.vaultId !== requiredVaultId
      ) {
        return "session_unavailable";
      }

      const activeSession =
        material === null
          ? null
          : {
              sessionId: material.sessionId,
              vaultId: material.vaultId,
              generation: this.activationGeneration,
            };
      let shouldRemove = true;

      try {
        shouldRemove = await beforeRemoval(activeSession);
      } catch (error) {
        firstError ??= error;
      }

      if (!shouldRemove) {
        if (firstError !== undefined) {
          throw firstError;
        }

        return "stale_action";
      }

      if (
        material !== null ||
        materialReadFailed ||
        invalidateWhenUnavailable
      ) {
        try {
          await this.removeSessionRecords(material ?? undefined);
        } catch (error) {
          firstError ??= error;
        }
      }

      if (firstError !== undefined) {
        throw firstError;
      }

      return material === null ? "session_unavailable" : "removed";
    });
  }

  private async restoreSession(): Promise<UnlockedVaultSession | null> {
    const storedMaterial =
      await this.materialRepository.getUnlockedVaultSessionMaterial();
    const material = this.getActiveMaterial(storedMaterial);

    if (material === null) {
      return null;
    }

    try {
      const encryptedPayload =
        await this.encryptedPayloadRepository.getEncryptedUnlockedVaultSessionPayload();

      if (encryptedPayload === null) {
        throw new UnlockedVaultSessionInvalidError(
          "encrypted payload is missing",
        );
      }

      return await this.restore(material, encryptedPayload);
    } catch (error) {
      await this.removeSessionRecordsPreservingRootCause(material);
      throw error;
    }
  }

  private async removeSessionRecords(
    knownMaterial?: UnlockedVaultSessionMaterial,
  ): Promise<void> {
    this.activationGeneration += 1;
    this.sessionIsInvalidated = true;

    let removalError: unknown;
    let materialReadError: unknown;
    let material = knownMaterial;

    if (material === undefined) {
      try {
        material =
          (await this.materialRepository.getUnlockedVaultSessionMaterial()) ??
          undefined;
      } catch (error) {
        materialReadError = error;
      }
    }

    if (material !== undefined) {
      this.wipeMaterial(material);
    }

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

    if (materialReadError !== undefined) {
      throw materialReadError;
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
      activeMaterial === undefined
        ? await this.crypto.generateUnlockedVaultSessionPayloadKey()
        : activeMaterial.payloadKey;
    const generatedPayloadKey =
      activeMaterial === undefined ? payloadKey : undefined;
    const { unlockedVault, sourceSnapshotVersionVector } = session;
    const context = {
      sessionId,
      vaultId: unlockedVault.vaultId,
      sourceSnapshotVersionVector,
    };
    let content: EncryptedUnlockedVaultSessionPayload["content"];

    try {
      content = await this.crypto.encryptUnlockedVaultSessionPayload(
        {
          vault: unlockedVault.vault,
        },
        payloadKey,
        context,
      );
    } catch (error) {
      bestEffortWipeArrayBuffers([generatedPayloadKey]);
      throw error;
    }

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

  private async removeSessionRecordsPreservingRootCause(
    knownMaterial?: UnlockedVaultSessionMaterial,
  ): Promise<void> {
    try {
      await this.removeSessionRecords(knownMaterial);
    } catch {
      // Preserve the original failure as the root cause.
    }
  }

  private wipeMaterial(material: UnlockedVaultSessionMaterial): void {
    bestEffortWipeArrayBuffers([
      material.vaultMasterKey,
      material.devicePrivateSignKey,
      material.devicePrivateVaultKey,
      material.deviceLocalProtectionKey,
      material.payloadKey,
    ]);
  }

  private wipeReplacedMaterial(
    previous: UnlockedVaultSessionMaterial,
    current: UnlockedVaultSessionMaterial,
  ): void {
    bestEffortWipeArrayBuffers([
      previous.vaultMasterKey === current.vaultMasterKey
        ? undefined
        : previous.vaultMasterKey,
      previous.devicePrivateSignKey === current.devicePrivateSignKey
        ? undefined
        : previous.devicePrivateSignKey,
      previous.devicePrivateVaultKey === current.devicePrivateVaultKey
        ? undefined
        : previous.devicePrivateVaultKey,
      previous.deviceLocalProtectionKey === current.deviceLocalProtectionKey
        ? undefined
        : previous.deviceLocalProtectionKey,
      previous.payloadKey === current.payloadKey
        ? undefined
        : previous.payloadKey,
    ]);
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
