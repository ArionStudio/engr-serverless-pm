import type { DeviceEnrollmentApprovalService } from "../../services/trust/device-enrollment-approval.service";
import { areJsonEqual } from "../../domain/common";
import type {
  DeviceAccessMaterial,
  DeviceAccessRecoveryBackup,
  DeviceEnrollmentResponse,
  LocalKeysPayload,
} from "../../domain/device-trust";
import { INITIAL_DEVICE_ACCESS_REVISION } from "../../domain/device-trust/device-access-revision";
import { isValidLocalAccessGenerationId } from "../../domain/device-trust/device-access-records";
import type { RawMasterPassword } from "../../domain/master-password";
import { assertNewMasterPasswordMeetsPolicy } from "../../domain/master-password/master-password.utils";
import type { RecoveryKeyMnemonic } from "../../domain/recovery";
import type {
  SyncAccess,
  SyncSetupInput,
  SyncUploadStatus,
} from "../../domain/sync";
import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot";
import {
  areVaultSnapshotDescriptorsEqual,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot";
import type { UnlockedVault } from "../../domain/session";
import type { Vault } from "../../domain/vault";
import type { VisibleVaultFields } from "../../domain/vault";
import { toVisibleVaultFields } from "../../domain/vault/visible-vault.mapper";
import type { LocalVaultDescriptor } from "../../domain/vault";
import { addDeviceProfileToVault } from "../../domain/vault/vault-device.mutations";
import { incrementVersionVector } from "../../domain/versioning";
import type { VersionVector } from "../../domain/versioning";
import {
  DeviceEnrollmentRollbackIncompleteError,
  DeviceEnrollmentIntegrityError,
  DeviceEnrollmentRemoteSnapshotChangedError,
  DeviceEnrollmentSyncCredentialsRequiredError,
} from "../../errors/device-enrollment.errors";
import {
  InvalidSyncConfigError,
  RemoteVaultSnapshotChangedError,
  SyncRemovalPendingError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import { UnlockedVaultSessionExpiredError } from "../../errors/vault-session.errors";
import { LocalVaultAlreadyInitializedError } from "../../errors/vault-lifecycle.errors";
import { DeviceAccessMaterialChangedError } from "../../errors/vault-device.errors";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { IdPort } from "../../ports/system/id.port";
import type { VaultDisplayNamePort } from "../../ports/vault/vault-display-name.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { VaultLockDelayMs } from "../../domain/scheduled-task/scheduled-task-delay.type";
import type { VaultLifecycleCleanupService } from "../../services/session/vault-lifecycle-cleanup.service";
import type { ClipboardOperationCoordinatorPort } from "../../ports/clipboard/clipboard-operation-coordinator.port";
import { VaultSessionActivationService } from "../../services/session/vault-session-activation.service";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync/vault-sync-guard.service";

export type PerformDeviceEnrollmentCommandParams = {
  readonly enrollmentResponse: DeviceEnrollmentResponse;
  readonly masterPassword: RawMasterPassword;
  readonly deviceName: string;
  readonly syncConfig?: SyncSetupInput;
  readonly lockAfterMs: VaultLockDelayMs;
};

export type PerformDeviceEnrollmentResult = {
  readonly displayName: string;
  readonly vault: VisibleVaultFields;
  readonly deviceId: string;
  readonly recoveryMnemonicKey: RecoveryKeyMnemonic;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
  readonly syncUpload: SyncUploadStatus;
};

export class PerformDeviceEnrollmentUseCase {
  private readonly bip39: Bip39Port;
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultDisplayName: VaultDisplayNamePort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly vaultTrust: VaultTrustService;
  private readonly sessionActivation: VaultSessionActivationService;
  private readonly lifecycleCleanup: VaultLifecycleCleanupService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly enrollmentApproval: DeviceEnrollmentApprovalService;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    ids: IdPort,
    bip39: Bip39Port,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultDisplayName: VaultDisplayNamePort,
    vaultLocalRepository: VaultLocalRepositoryPort,
    lifecycleCleanup: VaultLifecycleCleanupService,
    scheduledTasks: ScheduledTaskPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
    clipboardOperations: ClipboardOperationCoordinatorPort,
    enrollmentApproval: DeviceEnrollmentApprovalService,
  ) {
    this.bip39 = bip39;
    this.clock = clock;
    this.crypto = crypto;
    this.ids = ids;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultDisplayName = vaultDisplayName;
    this.vaultLocalRepository = vaultLocalRepository;
    this.vaultTrust = new VaultTrustService(crypto);
    this.sessionActivation = new VaultSessionActivationService(
      clock,
      ids,
      scheduledTasks,
      vaultLockTasks,
      unlockedVaultSession,
      clipboardOperations,
    );
    this.lifecycleCleanup = lifecycleCleanup;
    this.enrollmentApproval = enrollmentApproval;
    this.vaultSyncGuard = new VaultSyncGuardService(
      syncProvider,
      new VaultSnapshotService(crypto, clock, vaultLocalRepository),
      unlockedVaultSession,
      crypto,
      vaultLocalRepository,
    );
  }

  async execute(
    params: PerformDeviceEnrollmentCommandParams,
  ): Promise<PerformDeviceEnrollmentResult> {
    const lockAfterMs = this.sessionActivation.requireValidLockDelay(
      params.lockAfterMs,
    );
    assertNewMasterPasswordMeetsPolicy(params.masterPassword);
    const response = params.enrollmentResponse;
    const [existingDescriptor, existingAccessMaterial] = await Promise.all([
      this.vaultLocalRepository.getLocalVaultDescriptor(response.vaultId),
      this.vaultLocalRepository.getDeviceAccessMaterial(response.vaultId),
    ]);

    if (existingDescriptor !== null || existingAccessMaterial !== null) {
      throw new LocalVaultAlreadyInitializedError(response.vaultId);
    }

    const activationAuthorization =
      await this.unlockedVaultSession.requireVaultCanBeActivated(
        response.vaultId,
      );
    const ephemeralSecrets: ArrayBuffer[] = [];
    const sessionSecrets: ArrayBuffer[] = [];
    let sessionActivated = false;

    try {
      const opened = await this.enrollmentApproval.open(
        response,
        params.masterPassword,
      );
      sessionSecrets.push(...opened.secrets);
      const {
        privateState,
        request,
        authorizedSnapshot,
        verifiedTrust,
        vaultMasterKey,
        authorizedVault,
      } = opened;
      const timestamp = this.clock.now();
      const vault = addDeviceProfileToVault(
        authorizedVault,
        request.payload.deviceId,
        params.deviceName,
        timestamp,
      );
      const syncAccess = await this.prepareSyncAccess(
        response.vaultId,
        vault,
        params.syncConfig,
        authorizedSnapshot,
      );
      const authorizedSnapshotDigest =
        await this.crypto.digestVaultSnapshot(authorizedSnapshot);
      const unsignedSnapshot: UnsignedVaultSnapshot = {
        metadata: {
          ...authorizedSnapshot.metadata,
          revisionTimestamp: timestamp,
          snapshotVersionVector: incrementVersionVector(
            authorizedSnapshot.metadata.snapshotVersionVector,
            request.payload.deviceId,
          ),
          createdByDeviceId: request.payload.deviceId,
          uploadExpectedRemoteSnapshotIdentity: {
            descriptor: toVaultSnapshotDescriptor(
              response.vaultId,
              authorizedSnapshot,
            ),
            snapshotDigest: authorizedSnapshotDigest,
          },
        },
        trustChain: authorizedSnapshot.trustChain,
        keySlots: authorizedSnapshot.keySlots,
        content: await this.crypto.encryptVaultSnapshotContent(
          vault,
          vaultMasterKey,
        ),
      };
      const snapshot: VaultSnapshot = {
        ...unsignedSnapshot,
        signature: await this.crypto.signVaultSnapshot(
          unsignedSnapshot,
          privateState.devicePrivateSignKey,
        ),
      };
      await this.vaultTrust.verifySnapshot(
        response.vaultId,
        snapshot,
        verifiedTrust,
      );

      const recoverySecretKey = await this.crypto.generateRecoveryKey();
      ephemeralSecrets.push(recoverySecretKey);
      const recoveryMnemonicKey =
        await this.bip39.recoveryKeyToMnemonic(recoverySecretKey);
      const masterPasswordSalt = await this.crypto.generateMasterPasswordSalt();
      const nextLocalRootKey = await this.crypto.deriveLocalRootKey(
        params.masterPassword,
        masterPasswordSalt,
      );
      ephemeralSecrets.push(nextLocalRootKey);
      const localKeysProtectionSalt =
        await this.crypto.generateLocalKeysProtectionSalt();
      const localKeysProtectionKey =
        await this.crypto.deriveLocalKeysProtectionKey(
          nextLocalRootKey,
          localKeysProtectionSalt,
        );
      ephemeralSecrets.push(localKeysProtectionKey);
      const localKeysPayload: LocalKeysPayload = {
        devicePrivateSignKey: privateState.devicePrivateSignKey,
        devicePrivateVaultKey: privateState.devicePrivateVaultKey,
        deviceLocalProtectionKey: privateState.deviceLocalProtectionKey,
        vaultTrustAnchor: response.vaultTrustAnchor,
      };
      const recoveryLocalKeysProtectionSalt =
        await this.crypto.generateRecoveryLocalKeysProtectionSalt();
      const recoveryLocalKeysProtectionKey =
        await this.crypto.deriveRecoveryLocalKeysProtectionKey(
          recoverySecretKey,
          recoveryLocalKeysProtectionSalt,
        );
      ephemeralSecrets.push(recoveryLocalKeysProtectionKey);
      const localAccessGenerationId = await this.ids.generateId();

      if (!isValidLocalAccessGenerationId(localAccessGenerationId)) {
        throw new DeviceAccessMaterialChangedError(response.vaultId);
      }
      const deviceAccessMaterial: DeviceAccessMaterial = {
        revision: INITIAL_DEVICE_ACCESS_REVISION,
        localAccessGenerationId,
        vaultId: response.vaultId,
        deviceId: request.payload.deviceId,
        algorithmSuiteId: this.crypto.algorithmSuite.id,
        masterPasswordSalt,
        localKeysProtectionSalt,
        devicePublicSignKey: request.payload.publicSignKey,
        devicePublicVaultKey: request.payload.publicVaultKey,
        protectedLocalKeys: await this.crypto.wrapLocalKeysPayload(
          localKeysPayload,
          localKeysProtectionKey,
        ),
      };
      const deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup = {
        revision: INITIAL_DEVICE_ACCESS_REVISION,
        localAccessGenerationId,
        vaultId: response.vaultId,
        deviceId: request.payload.deviceId,
        algorithmSuiteId: this.crypto.algorithmSuite.id,
        recoveryLocalKeysProtectionSalt,
        devicePublicSignKey: request.payload.publicSignKey,
        devicePublicVaultKey: request.payload.publicVaultKey,
        protectedLocalKeys: await this.crypto.wrapLocalKeysPayload(
          localKeysPayload,
          recoveryLocalKeysProtectionKey,
        ),
      };
      const descriptor: LocalVaultDescriptor = {
        vaultId: response.vaultId,
        displayName: await this.vaultDisplayName.generateVaultDisplayName(),
        createdAt: authorizedSnapshot.metadata.vaultCreationTimestamp,
      };
      const snapshotDigest = await this.crypto.digestVaultSnapshot(snapshot);
      const checkpoint = await this.vaultTrust.createCheckpoint(
        snapshot,
        verifiedTrust,
        request.payload.deviceId,
        privateState.devicePrivateSignKey,
      );
      const encryptedSyncCredentialState =
        await this.crypto.encryptDeviceSyncCredentialState(
          { currentCredentials: syncAccess.credentials },
          privateState.deviceLocalProtectionKey,
          {
            vaultId: response.vaultId,
            deviceId: request.payload.deviceId,
            provider: syncAccess.target.provider,
            target: syncAccess.target,
          },
        );
      let expectedRollbackSyncCredentialState = encryptedSyncCredentialState;
      const unlockedVault: UnlockedVault = {
        vaultId: response.vaultId,
        deviceId: request.payload.deviceId,
        vault,
        vaultMasterKey,
        devicePrivateSignKey: privateState.devicePrivateSignKey,
        devicePrivateVaultKey: privateState.devicePrivateVaultKey,
        deviceLocalProtectionKey: privateState.deviceLocalProtectionKey,
        trustedSnapshotContext: {
          snapshotDigest,
          trust: verifiedTrust,
        },
        vaultTrustAnchor: response.vaultTrustAnchor,
      };

      const activatedSession = await this.sessionActivation.activate({
        activationAuthorization,
        unlockedVault,
        sourceSnapshotVersionVector: snapshot.metadata.snapshotVersionVector,
        lockAfterMs,
        prepareActivation: async () =>
          this.vaultLocalRepository.saveInitializedLocalVault({
            descriptor,
            deviceAccessMaterial,
            deviceAccessRecoveryBackup,
            snapshot,
            checkpoint,
            syncCredentialState: encryptedSyncCredentialState,
          }),
        rollbackPreparedActivation: async () => {
          await this.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch(
            {
              vaultId: response.vaultId,
              expectedDescriptor: descriptor,
              expectedDeviceAccessMaterial: deviceAccessMaterial,
              expectedDeviceAccessRecoveryBackup: deviceAccessRecoveryBackup,
              expectedSnapshotDigest: snapshotDigest,
              expectedCheckpoint: checkpoint,
              expectedSyncCredentialState: expectedRollbackSyncCredentialState,
            },
          );
        },
      });
      const { sessionId, generation: sessionGeneration } = activatedSession;
      sessionActivated = true;

      let syncUpload: SyncUploadStatus = "complete";

      try {
        syncUpload = await this.vaultSyncGuard.uploadTrackedSnapshot({
          sessionId,
          vaultId: response.vaultId,
          unlockedVault,
          syncAccess,
          snapshot,
          snapshotDigest,
          checkpoint,
          expectedRemoteSnapshotIdentity: {
            descriptor: toVaultSnapshotDescriptor(
              response.vaultId,
              authorizedSnapshot,
            ),
            snapshotDigest: authorizedSnapshotDigest,
          },
          onIntentStaged: ({ pending }) => {
            expectedRollbackSyncCredentialState = pending;
          },
        });
      } catch (error) {
        const uploadError =
          error instanceof RemoteVaultSnapshotChangedError
            ? new DeviceEnrollmentRemoteSnapshotChangedError(response.vaultId, {
                cause: error,
              })
            : error;
        const rollbackResult =
          await this.lifecycleCleanup.discardIfSessionIsActive(
            {
              sessionId,
              vaultId: response.vaultId,
              generation: sessionGeneration,
              sourceSnapshotVersionVector:
                snapshot.metadata.snapshotVersionVector,
            },
            async () =>
              this.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch(
                {
                  vaultId: response.vaultId,
                  expectedDescriptor: descriptor,
                  expectedDeviceAccessMaterial: deviceAccessMaterial,
                  expectedDeviceAccessRecoveryBackup:
                    deviceAccessRecoveryBackup,
                  expectedSnapshotDigest: snapshotDigest,
                  expectedCheckpoint: checkpoint,
                  expectedSyncCredentialState:
                    expectedRollbackSyncCredentialState,
                },
              ),
          );

        if (
          rollbackResult !== "session_advanced" &&
          rollbackResult !== "session_replaced"
        ) {
          sessionActivated = false;
        }

        if (rollbackResult !== "discarded") {
          throw new DeviceEnrollmentRollbackIncompleteError(
            response.vaultId,
            uploadError,
          );
        }

        throw uploadError;
      }

      try {
        await this.vaultLocalRepository.removePendingDeviceEnrollment(
          response.requestId,
        );
      } catch {
        // Cleanup cannot turn an already committed enrollment into a failure.
      }

      return await this.unlockedVaultSession.runWithUnlockedVaultContext(
        response.vaultId,
        "read new-device recovery words",
        async (current) => {
          if (current.sessionId !== sessionId)
            throw new UnlockedVaultSessionExpiredError(response.vaultId);
          return {
            displayName: descriptor.displayName,
            vault: toVisibleVaultFields(vault),
            deviceId: request.payload.deviceId,
            recoveryMnemonicKey,
            snapshotVersionVector: {
              ...snapshot.metadata.snapshotVersionVector,
            },
            revisionTimestamp: snapshot.metadata.revisionTimestamp,
            syncUpload,
          };
        },
      );
    } finally {
      bestEffortWipeArrayBuffers(ephemeralSecrets);

      if (!sessionActivated) {
        bestEffortWipeArrayBuffers(sessionSecrets);
      }
    }
  }

  private async prepareSyncAccess(
    vaultId: string,
    vault: Vault,
    syncConfig: SyncSetupInput | undefined,
    authorizedSnapshot: VaultSnapshot,
  ): Promise<SyncAccess> {
    if (vault.syncRemovalPending !== undefined) {
      throw new SyncRemovalPendingError(vaultId, "complete device enrollment");
    }

    if (vault.syncTarget === undefined) {
      throw new SyncNotConfiguredError(vaultId, "complete device enrollment");
    }

    if (syncConfig === undefined) {
      throw new DeviceEnrollmentSyncCredentialsRequiredError(vaultId);
    }

    let syncAccess: SyncAccess;

    try {
      syncAccess = await this.syncProvider.setup(syncConfig);
    } catch {
      throw new InvalidSyncConfigError();
    }

    if (!areJsonEqual(syncAccess.target, vault.syncTarget)) {
      throw new DeviceEnrollmentIntegrityError(
        vaultId,
        "local sync credentials target another vault namespace",
      );
    }

    const remoteDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncAccess,
        vaultId,
      );

    if (
      remoteDescriptor === null ||
      !areVaultSnapshotDescriptorsEqual(
        remoteDescriptor,
        toVaultSnapshotDescriptor(vaultId, authorizedSnapshot),
      )
    ) {
      throw new DeviceEnrollmentRemoteSnapshotChangedError(vaultId);
    }

    return syncAccess;
  }
}
