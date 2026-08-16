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
import type {
  ClipboardOperationCoordinatorPort,
  ClipboardOperationLease,
} from "../../ports/clipboard/clipboard-operation-coordinator.port";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/session/encrypted-unlocked-vault-session-payload-repository.port";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/session/unlocked-vault-session-material-repository.port";
import {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionExpiredError,
  UnlockedVaultSessionInvalidError,
  VaultMustBeUnlockedError,
} from "../../errors/vault-session.errors";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";

type PersistedUnlockedVaultSessionIdentity = Awaited<
  ReturnType<
    UnlockedVaultSessionMaterialRepositoryPort["getPersistedUnlockedVaultSessionIdentity"]
  >
>;

export type VaultSessionActivationAuthorization = {
  readonly localGeneration: number;
  readonly sharedEpoch: number;
};

type SessionInvalidationState =
  | { readonly kind: "none" }
  | { readonly kind: "known"; readonly sessionId: string }
  | {
      readonly kind: "unknown";
      readonly materialRemovalSucceeded: boolean;
    };

export class UnlockedVaultSessionService {
  private readonly materialRepository: UnlockedVaultSessionMaterialRepositoryPort;
  private readonly encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort;
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;
  private readonly clipboardOperations: ClipboardOperationCoordinatorPort;
  private pendingSessionOperation: Promise<void> = Promise.resolve();
  private activationGeneration = 0;
  private invalidationState: SessionInvalidationState = { kind: "none" };

  constructor(
    materialRepository: UnlockedVaultSessionMaterialRepositoryPort,
    encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort,
    crypto: CryptoPort,
    ids: IdPort,
    clipboardOperations: ClipboardOperationCoordinatorPort,
  ) {
    this.materialRepository = materialRepository;
    this.encryptedPayloadRepository = encryptedPayloadRepository;
    this.crypto = crypto;
    this.ids = ids;
    this.clipboardOperations = clipboardOperations;
  }

  async requireVaultCanBeActivated(
    vaultId: string,
  ): Promise<VaultSessionActivationAuthorization> {
    return this.runCoordinatedSessionMutation(undefined, async () => {
      const sharedEpoch =
        await this.materialRepository.getUnlockedVaultSessionEpoch();
      const persistedIdentity =
        await this.materialRepository.getPersistedUnlockedVaultSessionIdentity();
      await this.reconcileActiveMaterial(persistedIdentity);

      if (persistedIdentity !== null && persistedIdentity.vaultId !== vaultId) {
        throw new ActiveUnlockedVaultMismatchError(
          persistedIdentity.vaultId,
          vaultId,
        );
      }

      return {
        localGeneration: this.activationGeneration,
        sharedEpoch,
      };
    });
  }

  async get(
    coordinationLease?: ClipboardOperationLease,
  ): Promise<UnlockedVaultSession | null> {
    return this.runCoordinatedSessionMutation(coordinationLease, async () =>
      this.restoreSession(),
    );
  }

  async getActiveVaultId(
    coordinationLease?: ClipboardOperationLease,
  ): Promise<string | null> {
    return this.runCoordinatedSessionMutation(coordinationLease, async () => {
      const persistedIdentity =
        await this.materialRepository.getPersistedUnlockedVaultSessionIdentity();
      const { material, reconciled } =
        await this.reconcileActiveMaterial(persistedIdentity);

      if (material !== null) {
        return material.vaultId;
      }

      if (
        persistedIdentity === null ||
        this.invalidationState.kind !== "none"
      ) {
        return null;
      }

      if (!reconciled) {
        await this.materialRepository.evictCachedUnlockedVaultSessionMaterial(
          null,
        );
      }

      return persistedIdentity.vaultId;
    });
  }

  async requireUnlockedVaultContext(
    vaultId: string,
    operation: string,
    coordinationLease?: ClipboardOperationLease,
  ): Promise<UnlockedVaultSession> {
    return this.runWithUnlockedVaultContext(
      vaultId,
      operation,
      async (session) => session,
      coordinationLease,
    );
  }

  async runWithUnlockedVaultContext<T>(
    vaultId: string,
    operation: string,
    run: (session: UnlockedVaultSession) => Promise<T>,
    coordinationLease?: ClipboardOperationLease,
  ): Promise<T> {
    return this.runCoordinatedSessionMutation(coordinationLease, async () => {
      const unlockedVaultSession = await this.restoreSession();

      if (
        unlockedVaultSession === null ||
        unlockedVaultSession.unlockedVault.vaultId !== vaultId
      ) {
        throw new VaultMustBeUnlockedError(vaultId, operation);
      }

      return run(unlockedVaultSession);
    });
  }

  async persistForActiveSession<T>(
    sessionId: string,
    vaultId: string,
    operation: () => Promise<T>,
    coordinationLease?: ClipboardOperationLease,
  ): Promise<T> {
    return this.runCoordinatedSessionMutation(coordinationLease, async () => {
      const persistedIdentity =
        await this.materialRepository.getPersistedUnlockedVaultSessionIdentity();
      const { material } =
        await this.reconcileActiveMaterial(persistedIdentity);
      this.requireActiveSession(material, sessionId, vaultId);
      await this.materialRepository.advanceUnlockedVaultSessionEpoch();
      this.activationGeneration += 1;

      return operation();
    });
  }

  async restorePersistedState(
    sessionId: string,
    vaultId: string,
    sourceSnapshotVersionVector: VersionVector,
    restore: () => Promise<void>,
    coordinationLease?: ClipboardOperationLease,
  ): Promise<"restored" | "session_advanced" | "rollback_failed"> {
    let operationStarted = false;

    try {
      return await this.runCoordinatedSessionMutation(
        coordinationLease,
        async () => {
          operationStarted = true;
          let activeMaterial: UnlockedVaultSessionMaterial | null;
          let materialReconciled: boolean;
          let persistedIdentity: PersistedUnlockedVaultSessionIdentity;

          try {
            persistedIdentity =
              await this.materialRepository.getPersistedUnlockedVaultSessionIdentity();
            ({ material: activeMaterial, reconciled: materialReconciled } =
              await this.reconcileActiveMaterial(persistedIdentity));
          } catch {
            return "rollback_failed";
          }

          if (
            materialReconciled ||
            (persistedIdentity !== null &&
              (persistedIdentity.sessionId !== sessionId ||
                persistedIdentity.vaultId !== vaultId ||
                compareVersionVectors(
                  persistedIdentity.sourceSnapshotVersionVector,
                  sourceSnapshotVersionVector,
                ) !== "equal" ||
                activeMaterial === null))
          ) {
            return "session_advanced";
          }

          if (
            activeMaterial !== null &&
            activeMaterial.vaultId === vaultId &&
            (!this.isActiveSession(activeMaterial, sessionId, vaultId) ||
              compareVersionVectors(
                activeMaterial.sourceSnapshotVersionVector,
                sourceSnapshotVersionVector,
              ) !== "equal")
          ) {
            return "session_advanced";
          }

          if (activeMaterial === null) {
            try {
              await this.materialRepository.advanceUnlockedVaultSessionEpoch();
            } catch {
              return "rollback_failed";
            }
            this.activationGeneration += 1;
          }

          try {
            await restore();
          } catch {
            if (
              activeMaterial !== null &&
              this.isActiveSession(activeMaterial, sessionId, vaultId)
            ) {
              await this.revokeAuthorizationsAndRemoveSessionRecordsPreservingRootCause(
                activeMaterial,
              );
            }

            return "rollback_failed";
          }

          return "restored";
        },
      );
    } catch (error) {
      if (!operationStarted) {
        return "rollback_failed";
      }

      throw error;
    }
  }

  async discardIfSessionIsActive(
    sessionId: string,
    vaultId: string,
    generation: number,
    sourceSnapshotVersionVector: VersionVector,
    beforeRemoval: () => Promise<void>,
    discard: () => Promise<boolean>,
    coordinationLease?: ClipboardOperationLease,
  ): Promise<
    | "discarded"
    | "session_advanced"
    | "session_replaced"
    | "session_unavailable"
    | "rollback_failed"
  > {
    return this.runCoordinatedSessionMutation(coordinationLease, async () => {
      let persistedIdentity: PersistedUnlockedVaultSessionIdentity;

      try {
        persistedIdentity =
          await this.materialRepository.getPersistedUnlockedVaultSessionIdentity();
      } catch {
        return "session_advanced";
      }

      let activeMaterial: UnlockedVaultSessionMaterial | null;

      try {
        ({ material: activeMaterial } =
          await this.reconcileActiveMaterial(persistedIdentity));
      } catch {
        return "session_advanced";
      }

      if (persistedIdentity === null) {
        return generation === this.activationGeneration
          ? "session_unavailable"
          : "session_replaced";
      }

      if (
        persistedIdentity.sessionId !== sessionId ||
        persistedIdentity.vaultId !== vaultId
      ) {
        return "session_replaced";
      }

      if (
        compareVersionVectors(
          persistedIdentity.sourceSnapshotVersionVector,
          sourceSnapshotVersionVector,
        ) !== "equal"
      ) {
        return "session_advanced";
      }

      if (generation !== this.activationGeneration) {
        return "session_advanced";
      }

      if (
        activeMaterial === null ||
        !this.isActiveSession(activeMaterial, sessionId, vaultId)
      ) {
        return "session_unavailable";
      }

      let cleanupFailed = false;

      try {
        await beforeRemoval();
      } catch {
        cleanupFailed = true;
      }

      try {
        await this.revokeAuthorizationsAndRemoveSessionRecords(activeMaterial);
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
    activationAuthorization: VaultSessionActivationAuthorization,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
    coordinationLease?: ClipboardOperationLease,
  ): Promise<string> {
    const activatedSession = await this.runCoordinatedSessionMutation(
      coordinationLease,
      async () =>
        this.activateWithinSessionOperation(
          activationAuthorization,
          unlockedVault,
          sourceSnapshotVersionVector,
        ),
    );

    return activatedSession.sessionId;
  }

  async activateWithAutoLock(
    activationAuthorization: VaultSessionActivationAuthorization,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
    installAutoLock: () => Promise<void>,
    rollbackAutoLock: () => Promise<void>,
    coordinationLease?: ClipboardOperationLease,
  ): Promise<{ readonly sessionId: string; readonly generation: number }> {
    return this.runCoordinatedSessionMutation(coordinationLease, async () => {
      let activationPreparationStarted = false;

      try {
        return await this.activateWithinSessionOperation(
          activationAuthorization,
          unlockedVault,
          sourceSnapshotVersionVector,
          async () => {
            activationPreparationStarted = true;
            await installAutoLock();
          },
        );
      } catch (error) {
        if (activationPreparationStarted) {
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
    activationAuthorization: VaultSessionActivationAuthorization,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
    beforeActivation?: () => Promise<void>,
  ): Promise<{ readonly sessionId: string; readonly generation: number }> {
    if (activationAuthorization.localGeneration !== this.activationGeneration) {
      throw new UnlockedVaultSessionExpiredError(unlockedVault.vaultId);
    }

    const sharedEpoch =
      await this.materialRepository.getUnlockedVaultSessionEpoch();

    if (activationAuthorization.sharedEpoch !== sharedEpoch) {
      throw new UnlockedVaultSessionExpiredError(unlockedVault.vaultId);
    }

    const persistedIdentity =
      await this.materialRepository.getPersistedUnlockedVaultSessionIdentity();
    const { material: activeMaterial, reconciled } =
      await this.reconcileActiveMaterial(persistedIdentity);

    if (reconciled) {
      throw new UnlockedVaultSessionExpiredError(unlockedVault.vaultId);
    }

    if (
      persistedIdentity !== null &&
      persistedIdentity.vaultId !== unlockedVault.vaultId
    ) {
      throw new ActiveUnlockedVaultMismatchError(
        persistedIdentity.vaultId,
        unlockedVault.vaultId,
      );
    }

    if (persistedIdentity?.sessionId !== activeMaterial?.sessionId) {
      throw new UnlockedVaultSessionExpiredError(unlockedVault.vaultId);
    }

    if (
      activeMaterial !== null &&
      activeMaterial.vaultId !== unlockedVault.vaultId
    ) {
      throw new ActiveUnlockedVaultMismatchError(
        activeMaterial.vaultId,
        unlockedVault.vaultId,
      );
    }

    await this.materialRepository.advanceUnlockedVaultSessionEpoch();

    try {
      await beforeActivation?.();

      const protectedSession = await this.protect({
        unlockedVault,
        sourceSnapshotVersionVector,
      });

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

      this.invalidationState = { kind: "none" };
      this.activationGeneration += 1;
      return {
        sessionId: protectedSession.material.sessionId,
        generation: this.activationGeneration,
      };
    } catch (error) {
      if (activeMaterial !== null && this.invalidationState.kind === "none") {
        await this.removeSessionRecordsPreservingRootCause(activeMaterial);
      }

      throw error;
    }
  }

  async commitPersistedSnapshot(
    sessionId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
    coordinationLease?: ClipboardOperationLease,
  ): Promise<void> {
    await this.runCoordinatedSessionMutation(coordinationLease, async () => {
      const persistedIdentity =
        await this.materialRepository.getPersistedUnlockedVaultSessionIdentity();
      const { material } =
        await this.reconcileActiveMaterial(persistedIdentity);
      const activeMaterial = this.requireActiveSession(
        material,
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
        await this.materialRepository.advanceUnlockedVaultSessionEpoch();
        this.wipeReplacedMaterial(activeMaterial, protectedSession.material);
        this.activationGeneration += 1;
      } catch (error) {
        if (protectedSession !== undefined) {
          this.wipeMaterial(protectedSession.material);
        }
        await this.revokeAuthorizationsAndRemoveSessionRecordsPreservingRootCause(
          activeMaterial,
        );
        throw error;
      }
    });
  }

  async remove(coordinationLease?: ClipboardOperationLease): Promise<void> {
    await this.runCoordinatedSessionMutation(coordinationLease, async () => {
      await this.revokeAuthorizationsAndRemoveSessionRecords();
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
    afterRemoval?: () => Promise<void>,
    coordinationLease?: ClipboardOperationLease,
    options: {
      readonly removeRecordsWhenUnavailableAfterAuthorization?: boolean;
    } = {},
  ): Promise<"removed" | "session_unavailable" | "stale_action"> {
    return this.runCoordinatedSessionMutation(coordinationLease, async () => {
      let firstError: unknown;
      let material: UnlockedVaultSessionMaterial | null = null;
      let materialReadFailed = false;
      let materialReconciled = false;
      let activeSessionAdvanced = false;
      let sessionRecordsRemoved = false;
      let persistedIdentity: PersistedUnlockedVaultSessionIdentity = null;
      let persistedIdentityReadFailed = false;

      try {
        persistedIdentity =
          await this.materialRepository.getPersistedUnlockedVaultSessionIdentity();
      } catch (error) {
        firstError = error;
        persistedIdentityReadFailed = true;
      }

      if (persistedIdentityReadFailed && requiredVaultId !== undefined) {
        throw firstError;
      }

      try {
        if (persistedIdentityReadFailed) {
          material =
            this.invalidationState.kind !== "none"
              ? null
              : await this.materialRepository.getUnlockedVaultSessionMaterial();
        } else {
          ({
            material,
            reconciled: materialReconciled,
            activeSessionAdvanced,
          } = await this.reconcileActiveMaterial(persistedIdentity));
        }
      } catch (error) {
        firstError ??= error;
        materialReadFailed = true;
      }

      if (materialReadFailed && requiredVaultId !== undefined) {
        throw firstError;
      }

      if (
        requiredVaultId !== undefined &&
        (persistedIdentity?.vaultId !== requiredVaultId ||
          (materialReconciled && !activeSessionAdvanced) ||
          (material === null && !activeSessionAdvanced))
      ) {
        return "session_unavailable";
      }

      if (invalidateWhenUnavailable) {
        try {
          await this.materialRepository.advanceUnlockedVaultSessionEpoch();
        } catch (error) {
          firstError ??= error;
        }
      }

      const activeIdentity = persistedIdentity ?? material;
      const activeSession =
        activeIdentity === null
          ? null
          : {
              sessionId: activeIdentity.sessionId,
              vaultId: activeIdentity.vaultId,
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

      if (!invalidateWhenUnavailable) {
        try {
          await this.materialRepository.advanceUnlockedVaultSessionEpoch();
        } catch (error) {
          firstError ??= error;
        }
      }

      if (
        persistedIdentity !== null ||
        persistedIdentityReadFailed ||
        materialReadFailed ||
        invalidateWhenUnavailable ||
        options.removeRecordsWhenUnavailableAfterAuthorization === true
      ) {
        try {
          await this.removeSessionRecords(material ?? undefined);
          sessionRecordsRemoved = true;
        } catch (error) {
          firstError ??= error;
        }
      }

      if (
        sessionRecordsRemoved &&
        (persistedIdentity !== null ||
          persistedIdentityReadFailed ||
          materialReadFailed ||
          activeSessionAdvanced)
      ) {
        try {
          await afterRemoval?.();
        } catch (error) {
          firstError ??= error;
        }
      }

      if (firstError !== undefined) {
        throw firstError;
      }

      return persistedIdentity === null && !activeSessionAdvanced
        ? "session_unavailable"
        : "removed";
    });
  }

  private async restoreSession(): Promise<UnlockedVaultSession | null> {
    let material: UnlockedVaultSessionMaterial | null | undefined;

    try {
      const persistedIdentity =
        await this.materialRepository.getPersistedUnlockedVaultSessionIdentity();
      ({ material } = await this.reconcileActiveMaterial(persistedIdentity));

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

      return await this.restore(material, encryptedPayload);
    } catch (error) {
      await this.revokeAuthorizationsAndRemoveSessionRecordsPreservingRootCause(
        material ?? undefined,
      );
      throw error;
    }
  }

  private async reconcileActiveMaterial(
    persistedIdentity: Pick<
      UnlockedVaultSessionMaterial,
      "sessionId" | "vaultId" | "sourceSnapshotVersionVector"
    > | null,
  ): Promise<{
    readonly material: UnlockedVaultSessionMaterial | null;
    readonly reconciled: boolean;
    readonly activeSessionAdvanced: boolean;
  }> {
    const invalidationState = this.invalidationState;

    if (invalidationState.kind !== "none") {
      if (
        persistedIdentity === null ||
        (invalidationState.kind === "known" &&
          persistedIdentity.sessionId === invalidationState.sessionId) ||
        (invalidationState.kind === "unknown" &&
          !invalidationState.materialRemovalSucceeded)
      ) {
        return {
          material: null,
          reconciled: false,
          activeSessionAdvanced: false,
        };
      }

      await this.materialRepository.evictCachedUnlockedVaultSessionMaterial(
        invalidationState.kind === "known" ? invalidationState.sessionId : null,
      );
      this.invalidationState = { kind: "none" };
      return this.reconcileActiveMaterial(persistedIdentity);
    }

    const material =
      await this.materialRepository.getUnlockedVaultSessionMaterial();

    if (material === null) {
      return {
        material: null,
        reconciled: false,
        activeSessionAdvanced: false,
      };
    }

    if (
      persistedIdentity !== null &&
      persistedIdentity.sessionId === material.sessionId &&
      persistedIdentity.vaultId === material.vaultId &&
      compareVersionVectors(
        persistedIdentity.sourceSnapshotVersionVector,
        material.sourceSnapshotVersionVector,
      ) === "equal"
    ) {
      return {
        material,
        reconciled: false,
        activeSessionAdvanced: false,
      };
    }

    const activeSessionAdvanced =
      persistedIdentity !== null &&
      persistedIdentity.sessionId === material.sessionId &&
      persistedIdentity.vaultId === material.vaultId;

    this.wipeMaterial(material);
    this.activationGeneration += 1;
    this.invalidationState = {
      kind: "known",
      sessionId: material.sessionId,
    };
    await this.materialRepository.evictCachedUnlockedVaultSessionMaterial(
      material.sessionId,
    );
    this.invalidationState = { kind: "none" };
    return { material: null, reconciled: true, activeSessionAdvanced };
  }

  private async removeSessionRecords(
    knownMaterial?: UnlockedVaultSessionMaterial,
  ): Promise<void> {
    this.activationGeneration += 1;
    this.invalidationState =
      knownMaterial === undefined
        ? { kind: "unknown", materialRemovalSucceeded: false }
        : { kind: "known", sessionId: knownMaterial.sessionId };

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
      this.invalidationState = {
        kind: "known",
        sessionId: material.sessionId,
      };
      this.wipeMaterial(material);
    }

    try {
      await this.materialRepository.removeUnlockedVaultSessionMaterial();
      if (this.invalidationState.kind === "unknown") {
        this.invalidationState = {
          kind: "unknown",
          materialRemovalSucceeded: true,
        };
      }
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

  private async revokeAuthorizationsAndRemoveSessionRecords(
    knownMaterial?: UnlockedVaultSessionMaterial,
  ): Promise<void> {
    let firstError: unknown;

    try {
      await this.materialRepository.advanceUnlockedVaultSessionEpoch();
    } catch (error) {
      firstError = error;
    }

    try {
      await this.removeSessionRecords(knownMaterial);
    } catch (error) {
      firstError ??= error;
    }

    if (firstError !== undefined) {
      throw firstError;
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

  private async revokeAuthorizationsAndRemoveSessionRecordsPreservingRootCause(
    knownMaterial?: UnlockedVaultSessionMaterial,
  ): Promise<void> {
    try {
      await this.revokeAuthorizationsAndRemoveSessionRecords(knownMaterial);
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

  private async runCoordinatedSessionMutation<T>(
    coordinationLease: ClipboardOperationLease | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (coordinationLease === undefined) {
      return this.clipboardOperations.runExclusive((acquiredLease) =>
        this.runCoordinatedSessionMutation(acquiredLease, operation),
      );
    }

    if (!this.clipboardOperations.isLeaseActive(coordinationLease)) {
      throw new Error(
        "Clipboard operation lease is not active for this coordinator.",
      );
    }

    return this.serializeSessionOperation(operation);
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
      this.invalidationState.kind === "none" &&
      activeMaterial.sessionId === sessionId &&
      activeMaterial.vaultId === vaultId
    );
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
