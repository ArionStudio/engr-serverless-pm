import { areJsonEqual } from "../../domain/common";
import type {
  DeviceAccessMaterial,
  DeviceAccessRecoveryBackup,
  DeviceEnrollmentResponse,
  LocalKeysPayload,
} from "../../domain/device-trust";
import type { RawMasterPassword } from "../../domain/master-password";
import type { RecoveryKeyMnemonic } from "../../domain/recovery";
import type { SyncAccess, SyncSetupInput } from "../../domain/sync";
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
import type { LocalVaultDescriptor } from "../../domain/vault";
import { addDeviceProfileToVault } from "../../domain/vault/vault-device.mutations";
import { incrementVersionVector } from "../../domain/versioning";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceEnrollmentRollbackIncompleteError,
  DeviceEnrollmentIntegrityError,
  DeviceEnrollmentRemoteSnapshotChangedError,
  DeviceEnrollmentSnapshotMismatchError,
  DeviceEnrollmentSyncCredentialsRequiredError,
  PendingDeviceEnrollmentMismatchError,
  PendingDeviceEnrollmentNotFoundError,
} from "../../errors/device-enrollment.errors";
import {
  InvalidSyncConfigError,
  RemoteVaultSnapshotChangedError,
  SyncRemovalPendingError,
} from "../../errors/sync.errors";
import { LocalVaultAlreadyInitializedError } from "../../errors/vault-lifecycle.errors";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VaultDisplayNamePort } from "../../ports/vault/vault-display-name.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { VaultTrustService } from "../../services/trust/vault-trust.service";

export type PerformDeviceEnrollmentCommandParams = {
  readonly enrollmentResponse: DeviceEnrollmentResponse;
  readonly masterPassword: RawMasterPassword;
  readonly deviceName: string;
  readonly syncConfig?: SyncSetupInput;
};

export type PerformDeviceEnrollmentResult = {
  readonly vault: Vault;
  readonly deviceId: string;
  readonly recoveryMnemonicKey: RecoveryKeyMnemonic;
  readonly syncUpload: "complete" | "pending";
};

export class PerformDeviceEnrollmentUseCase {
  private readonly bip39: Bip39Port;
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultDisplayName: VaultDisplayNamePort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    bip39: Bip39Port,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultDisplayName: VaultDisplayNamePort,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.bip39 = bip39;
    this.clock = clock;
    this.crypto = crypto;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultDisplayName = vaultDisplayName;
    this.vaultLocalRepository = vaultLocalRepository;
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async execute(
    params: PerformDeviceEnrollmentCommandParams,
  ): Promise<PerformDeviceEnrollmentResult> {
    const response = params.enrollmentResponse;
    const pending = await this.vaultLocalRepository.getPendingDeviceEnrollment(
      response.requestId,
    );

    if (pending === null) {
      throw new PendingDeviceEnrollmentNotFoundError(response.requestId);
    }

    if (
      response.version !== 1 ||
      pending.requestId !== response.requestId ||
      pending.vaultId !== response.vaultId ||
      pending.algorithmSuiteId !== this.crypto.algorithmSuite.id
    ) {
      throw new PendingDeviceEnrollmentMismatchError(response.requestId);
    }

    const [existingDescriptor, existingAccessMaterial] = await Promise.all([
      this.vaultLocalRepository.getLocalVaultDescriptor(response.vaultId),
      this.vaultLocalRepository.getDeviceAccessMaterial(response.vaultId),
    ]);

    if (existingDescriptor !== null || existingAccessMaterial !== null) {
      throw new LocalVaultAlreadyInitializedError(response.vaultId);
    }

    const activationGeneration =
      await this.unlockedVaultSession.requireVaultCanBeActivated(
        response.vaultId,
      );
    const localRootKey = await this.crypto.deriveLocalRootKey(
      params.masterPassword,
      pending.masterPasswordSalt,
    );
    const pendingProtectionKey =
      await this.crypto.deriveDeviceEnrollmentPrivateStateProtectionKey(
        localRootKey,
        pending.localKeysProtectionSalt,
      );
    const privateState = await this.crypto.unwrapDeviceEnrollmentPrivateState(
      pending.protectedPrivateState,
      pendingProtectionKey,
    );
    const request = privateState.request;

    if (
      request.payload.requestId !== response.requestId ||
      request.payload.vaultId !== response.vaultId ||
      request.payload.deviceId !== pending.deviceId ||
      !(await this.crypto.verifyDeviceEnrollmentRequestSignature(request)) ||
      !(await this.crypto.verifyDeviceSignKeyPair(
        request.payload.publicSignKey,
        privateState.devicePrivateSignKey,
      )) ||
      !(await this.crypto.verifyDeviceVaultKeyPair(
        request.payload.publicVaultKey,
        privateState.devicePrivateVaultKey,
      ))
    ) {
      throw new PendingDeviceEnrollmentMismatchError(response.requestId);
    }

    const authorizedSnapshot = response.snapshot;

    if (authorizedSnapshot.metadata.id !== response.vaultId) {
      throw new DeviceEnrollmentSnapshotMismatchError(
        response.vaultId,
        authorizedSnapshot.metadata.id,
      );
    }

    if (
      authorizedSnapshot.metadata.schemaVersion !== 1 ||
      authorizedSnapshot.metadata.algorithmSuiteId !==
        this.crypto.algorithmSuite.id
    ) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId: response.vaultId,
        artifact: "device enrollment snapshot",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: authorizedSnapshot.metadata.algorithmSuiteId,
      });
    }

    if (
      response.vaultTrustAnchor.genesisCertificateDigest !==
      request.payload.expectedGenesisCertificateDigest
    ) {
      throw new DeviceEnrollmentIntegrityError(
        response.vaultId,
        "response trust anchor does not match the enrollment request",
      );
    }

    const verifiedTrust = await this.vaultTrust.verifyTrustChain(
      response.vaultId,
      response.vaultTrustAnchor,
      authorizedSnapshot.trustChain,
    );
    await this.vaultTrust.verifySnapshot(
      response.vaultId,
      authorizedSnapshot,
      verifiedTrust,
    );

    const targetIdentity = verifiedTrust.trustedDevices.find(
      (device) => device.deviceId === request.payload.deviceId,
    );
    const targetSlots = authorizedSnapshot.keySlots.deviceSlots.filter(
      (slot) => slot.deviceId === request.payload.deviceId,
    );

    if (
      targetIdentity === undefined ||
      targetSlots.length !== 1 ||
      (await this.crypto.digestDevicePublicSignKey(
        targetIdentity.publicSignKey,
      )) !==
        (await this.crypto.digestDevicePublicSignKey(
          request.payload.publicSignKey,
        )) ||
      (await this.crypto.digestDevicePublicVaultKey(
        targetIdentity.publicVaultKey,
      )) !==
        (await this.crypto.digestDevicePublicVaultKey(
          request.payload.publicVaultKey,
        ))
    ) {
      throw new DeviceEnrollmentIntegrityError(
        response.vaultId,
        "target identity or vault key envelope does not match the request",
      );
    }

    const targetSlot = targetSlots[0];
    const vaultMasterKey = await this.crypto.openDeviceVaultKeyEnvelope(
      targetSlot.envelope,
      privateState.devicePrivateVaultKey,
      {
        vaultId: response.vaultId,
        deviceId: request.payload.deviceId,
        vaultKeyGeneration: authorizedSnapshot.metadata.vaultKeyGeneration,
        algorithmSuiteId: authorizedSnapshot.metadata.algorithmSuiteId,
      },
    );
    const authorizedVault = await this.crypto.decryptVaultSnapshotContent(
      authorizedSnapshot.content,
      vaultMasterKey,
    );
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
    const unsignedSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        ...authorizedSnapshot.metadata,
        revisionTimestamp: timestamp,
        snapshotVersionVector: incrementVersionVector(
          authorizedSnapshot.metadata.snapshotVersionVector,
          request.payload.deviceId,
        ),
        createdByDeviceId: request.payload.deviceId,
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
    const recoveryMnemonicKey =
      await this.bip39.recoveryKeyToMnemonic(recoverySecretKey);
    const masterPasswordSalt = await this.crypto.generateMasterPasswordSalt();
    const nextLocalRootKey = await this.crypto.deriveLocalRootKey(
      params.masterPassword,
      masterPasswordSalt,
    );
    const localKeysProtectionSalt =
      await this.crypto.generateLocalKeysProtectionSalt();
    const localKeysProtectionKey =
      await this.crypto.deriveLocalKeysProtectionKey(
        nextLocalRootKey,
        localKeysProtectionSalt,
      );
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
    const deviceAccessMaterial: DeviceAccessMaterial = {
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
      syncAccess === undefined
        ? undefined
        : await this.crypto.encryptDeviceSyncCredentialState(
            { currentCredentials: syncAccess.credentials },
            privateState.deviceLocalProtectionKey,
            {
              vaultId: response.vaultId,
              deviceId: request.payload.deviceId,
              provider: syncAccess.target.provider,
              target: syncAccess.target,
            },
          );
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

    await this.vaultLocalRepository.saveInitializedLocalVault({
      descriptor,
      deviceAccessMaterial,
      deviceAccessRecoveryBackup,
      snapshot,
      checkpoint,
      ...(encryptedSyncCredentialState === undefined
        ? {}
        : { syncCredentialState: encryptedSyncCredentialState }),
    });

    let sessionId: string;

    try {
      sessionId = await this.unlockedVaultSession.activate(
        activationGeneration,
        unlockedVault,
        snapshot.metadata.snapshotVersionVector,
      );
    } catch (error) {
      try {
        await this.vaultLocalRepository.removePersistedLocalVault(
          response.vaultId,
        );
      } catch {
        // Preserve the activation failure as the root cause.
      }

      throw error;
    }

    let syncUpload: "complete" | "pending" = "complete";

    if (syncAccess !== undefined) {
      try {
        await this.syncProvider.uploadVaultSnapshot(
          syncAccess,
          snapshot,
          toVaultSnapshotDescriptor(response.vaultId, authorizedSnapshot),
        );
      } catch (error) {
        if (!(error instanceof RemoteVaultSnapshotChangedError)) {
          syncUpload = "pending";
        } else {
          const remoteSnapshotChanged =
            new DeviceEnrollmentRemoteSnapshotChangedError(response.vaultId, {
              cause: error,
            });
          const rollbackResult =
            await this.unlockedVaultSession.discardIfSessionIsActive(
              sessionId,
              response.vaultId,
              snapshot.metadata.snapshotVersionVector,
              async () =>
                this.vaultLocalRepository.removePersistedLocalVaultIfSnapshotMatches(
                  response.vaultId,
                  snapshotDigest,
                ),
            );

          if (rollbackResult === "session_advanced") {
            syncUpload = "complete";
          } else if (rollbackResult !== "discarded") {
            throw new DeviceEnrollmentRollbackIncompleteError(
              response.vaultId,
              remoteSnapshotChanged,
            );
          } else {
            throw remoteSnapshotChanged;
          }
        }
      }
    }

    try {
      await this.vaultLocalRepository.removePendingDeviceEnrollment(
        response.requestId,
      );
    } catch {
      // Cleanup cannot turn an already committed enrollment into a failure.
    }

    return {
      vault,
      deviceId: request.payload.deviceId,
      recoveryMnemonicKey,
      syncUpload,
    };
  }

  private async prepareSyncAccess(
    vaultId: string,
    vault: Vault,
    syncConfig: SyncSetupInput | undefined,
    authorizedSnapshot: VaultSnapshot,
  ): Promise<SyncAccess | undefined> {
    if (vault.syncRemovalPending === true) {
      throw new SyncRemovalPendingError(vaultId, "complete device enrollment");
    }

    if (vault.syncTarget === undefined) {
      return undefined;
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
