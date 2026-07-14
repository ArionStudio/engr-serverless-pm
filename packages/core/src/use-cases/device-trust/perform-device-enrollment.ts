import type {
  CompletedDeviceEnrollmentProof,
  DeviceEnrollmentAuthorizationPayload,
} from "../../domain/device-trust";
import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust/device-access-recovery-backup";
import type { DeviceEnrollmentBundle } from "../../domain/device-trust/device-enrollment-bundle";
import type { LocalKeysPayload } from "../../domain/device-trust/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import {
  areVaultSnapshotDescriptorsEqual,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";
import type { Vault } from "../../domain/vault/vault";
import { addDeviceProfileToVault } from "../../domain/vault/vault-device.mutations";
import { incrementVersionVector } from "../../domain/versioning/version-vector.utils";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceEnrollmentAlreadyCompletedError,
  DeviceEnrollmentIntegrityError,
  DeviceEnrollmentRemoteSnapshotChangedError,
  DeviceEnrollmentKeySlotNotFoundError,
  DeviceEnrollmentSnapshotMismatchError,
} from "../../errors/device-enrollment.errors";
import {
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotNotFoundError,
  SyncConflictDetectedError,
} from "../../errors/sync.errors";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VaultDisplayNamePort } from "../../ports/vault/vault-display-name.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";

export type PerformDeviceEnrollmentCommandParams = {
  readonly enrollmentBundle: DeviceEnrollmentBundle;
  readonly masterPassword: RawMasterPassword;
  readonly deviceName: string;
};

export type PerformDeviceEnrollmentResult = {
  readonly vault: Vault;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
  readonly deviceId: string;
  readonly recoveryMnemonicKey: RecoveryKeyMnemonic;
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
    const { enrollmentBundle } = params;

    await this.unlockedVaultSession.requireVaultCanBeActivated(
      enrollmentBundle.vaultId,
    );

    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        enrollmentBundle.syncConfig,
        enrollmentBundle.vaultId,
      );

    if (remoteSnapshotDescriptor === null) {
      throw new RemoteVaultSnapshotNotFoundError(enrollmentBundle.vaultId);
    }

    const expectedSnapshotDescriptor = {
      vaultId: enrollmentBundle.vaultId,
      snapshotVersionVector: enrollmentBundle.snapshotVersionVector,
      revisionTimestamp: enrollmentBundle.revisionTimestamp,
    };

    if (
      !areVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        expectedSnapshotDescriptor,
      )
    ) {
      throw new DeviceEnrollmentRemoteSnapshotChangedError(
        enrollmentBundle.vaultId,
      );
    }

    const remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
      enrollmentBundle.syncConfig,
      remoteSnapshotDescriptor,
    );

    if (remoteSnapshot.metadata.id !== enrollmentBundle.vaultId) {
      throw new DeviceEnrollmentSnapshotMismatchError(
        enrollmentBundle.vaultId,
        remoteSnapshot.metadata.id,
      );
    }

    if (
      remoteSnapshot.metadata.algorithmSuiteId !== this.crypto.algorithmSuite.id
    ) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId: enrollmentBundle.vaultId,
        artifact: "vault snapshot",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: remoteSnapshot.metadata.algorithmSuiteId,
      });
    }

    if (remoteSnapshot.trustChain === undefined) {
      throw new VaultTrustStateInvalidError(
        enrollmentBundle.vaultId,
        "trust chain is missing",
      );
    }

    const verifiedTrust = await this.vaultTrust.verifyTrustChain(
      enrollmentBundle.vaultId,
      enrollmentBundle.vaultTrustAnchor,
      remoteSnapshot.trustChain,
    );
    await this.vaultTrust.verifySnapshot(
      enrollmentBundle.vaultId,
      remoteSnapshot,
      verifiedTrust,
    );

    const enrollmentKeySlot = remoteSnapshot.keySlots.enrollmentKeySlot;

    if (enrollmentKeySlot === undefined) {
      throw new DeviceEnrollmentKeySlotNotFoundError(enrollmentBundle.vaultId);
    }

    const revisionTimestamp = this.clock.now();

    const completedEnrollments =
      remoteSnapshot.keySlots.completedEnrollments ?? [];

    if (
      completedEnrollments.some(
        (proof) =>
          proof.enrollmentId === enrollmentKeySlot.enrollmentId ||
          proof.pendingDeviceId === enrollmentKeySlot.pendingDeviceId,
      ) ||
      remoteSnapshot.keySlots.deviceSlots.some(
        (deviceSlot) =>
          deviceSlot.deviceId === enrollmentKeySlot.pendingDeviceId,
      )
    ) {
      throw new DeviceEnrollmentAlreadyCompletedError(
        enrollmentBundle.vaultId,
        enrollmentKeySlot.enrollmentId,
      );
    }

    const pendingDevicePublicSignKeyDigest =
      await this.crypto.digestDevicePublicSignKey(
        enrollmentKeySlot.pendingDevicePublicSignKey,
      );

    if (
      pendingDevicePublicSignKeyDigest !==
      enrollmentKeySlot.pendingDevicePublicSignKeyDigest
    ) {
      throw new DeviceEnrollmentIntegrityError(
        enrollmentBundle.vaultId,
        "pending device public key digest does not match the enrollment slot",
      );
    }

    const protectedVaultMasterKeyDigest =
      await this.crypto.digestProtectedVaultMasterKey(
        enrollmentKeySlot.protectedVaultMasterKey,
      );

    if (
      protectedVaultMasterKeyDigest !==
      enrollmentKeySlot.protectedVaultMasterKeyDigest
    ) {
      throw new DeviceEnrollmentIntegrityError(
        enrollmentBundle.vaultId,
        "protected vault master key digest does not match the enrollment slot",
      );
    }

    const authorizerDevice = verifiedTrust.trustedDevices.find(
      (device) => device.deviceId === enrollmentKeySlot.authorizedByDeviceId,
    );

    if (authorizerDevice === undefined) {
      throw new DeviceEnrollmentIntegrityError(
        enrollmentBundle.vaultId,
        "enrollment authorizer device is not trusted by the snapshot",
      );
    }

    const enrollmentAuthorization: DeviceEnrollmentAuthorizationPayload = {
      version: 1,
      vaultId: enrollmentBundle.vaultId,
      enrollmentId: enrollmentKeySlot.enrollmentId,
      pendingDeviceId: enrollmentKeySlot.pendingDeviceId,
      pendingDevicePublicSignKeyDigest:
        enrollmentKeySlot.pendingDevicePublicSignKeyDigest,
      protectedVaultMasterKeyDigest:
        enrollmentKeySlot.protectedVaultMasterKeyDigest,
    };
    const isEnrollmentAuthorized =
      await this.crypto.verifyDeviceEnrollmentAuthorizationSignature(
        enrollmentAuthorization,
        enrollmentKeySlot.authorizerSignature,
        authorizerDevice.publicSignKey,
      );

    if (!isEnrollmentAuthorized) {
      throw new DeviceEnrollmentIntegrityError(
        enrollmentBundle.vaultId,
        "enrollment authorization signature is invalid",
      );
    }

    const enrollmentVaultMasterKeyProtectionKey =
      await this.crypto.deriveEnrollmentVaultMasterKeyProtectionKey(
        enrollmentBundle.enrollmentSecret,
      );
    const vaultMasterKey = await this.crypto.unwrapVaultMasterKey(
      enrollmentKeySlot.protectedVaultMasterKey,
      enrollmentVaultMasterKeyProtectionKey,
    );
    const vault = await this.crypto.decryptVaultSnapshotContent(
      remoteSnapshot.content,
      vaultMasterKey,
    );
    const downloadedDescriptor = toVaultSnapshotDescriptor(
      enrollmentBundle.vaultId,
      remoteSnapshot,
    );

    if (
      !areVaultSnapshotDescriptorsEqual(
        downloadedDescriptor,
        remoteSnapshotDescriptor,
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(enrollmentBundle.vaultId);
    }

    const deviceId = enrollmentKeySlot.pendingDeviceId;
    const devicePublicSignKey = enrollmentKeySlot.pendingDevicePublicSignKey;
    const devicePrivateSignKey = enrollmentBundle.pendingDevicePrivateSignKey;
    const vaultDisplayName =
      await this.vaultDisplayName.generateVaultDisplayName();
    const deviceSlotKey = await this.crypto.generateDeviceSlotKey();
    const masterPasswordSalt = await this.crypto.generateMasterPasswordSalt();
    const localRootKey = await this.crypto.deriveLocalRootKey(
      params.masterPassword,
      masterPasswordSalt,
    );
    const localKeysProtectionSalt =
      await this.crypto.generateLocalKeysProtectionSalt();
    const localKeysProtectionKey =
      await this.crypto.deriveLocalKeysProtectionKey(
        localRootKey,
        localKeysProtectionSalt,
      );
    const localKeysPayload: LocalKeysPayload = {
      deviceSlotKey,
      devicePrivateSignKey,
      vaultTrustAnchor: enrollmentBundle.vaultTrustAnchor,
    };
    const protectedLocalKeys = await this.crypto.wrapLocalKeysPayload(
      localKeysPayload,
      localKeysProtectionKey,
    );
    const recoverySecretKey = await this.crypto.generateRecoveryKey();
    const recoveryMnemonicKey =
      await this.bip39.recoveryKeyToMnemonic(recoverySecretKey);
    const recoveryLocalKeysProtectionSalt =
      await this.crypto.generateRecoveryLocalKeysProtectionSalt();
    const recoveryLocalKeysProtectionKey =
      await this.crypto.deriveRecoveryLocalKeysProtectionKey(
        recoverySecretKey,
        recoveryLocalKeysProtectionSalt,
      );
    const recoveryProtectedLocalKeys = await this.crypto.wrapLocalKeysPayload(
      localKeysPayload,
      recoveryLocalKeysProtectionKey,
    );
    const deviceSlotVaultMasterKeyProtectionKey =
      await this.crypto.deriveDeviceSlotVaultMasterKeyProtectionKey(
        deviceSlotKey,
      );
    const protectedDeviceVaultMasterKey = await this.crypto.wrapVaultMasterKey(
      vaultMasterKey,
      deviceSlotVaultMasterKeyProtectionKey,
    );
    const registeredVault = addDeviceProfileToVault(
      vault,
      deviceId,
      params.deviceName,
      revisionTimestamp,
    );
    const completedEnrollmentProof: CompletedDeviceEnrollmentProof = {
      ...enrollmentAuthorization,
      authorizedByDeviceId: enrollmentKeySlot.authorizedByDeviceId,
      authorizerSignature: enrollmentKeySlot.authorizerSignature,
    };
    const unsignedVaultSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        ...remoteSnapshot.metadata,
        id: enrollmentBundle.vaultId,
        revisionTimestamp,
        snapshotVersionVector: incrementVersionVector(
          remoteSnapshot.metadata.snapshotVersionVector,
          deviceId,
        ),
        createdByDeviceId: deviceId,
      },
      trustChain: remoteSnapshot.trustChain,
      keySlots: {
        deviceSlots: [
          ...remoteSnapshot.keySlots.deviceSlots,
          {
            deviceId,
            protectedVaultMasterKey: protectedDeviceVaultMasterKey,
            publicSignKey: devicePublicSignKey,
          },
        ],
        completedEnrollments: [
          ...completedEnrollments,
          completedEnrollmentProof,
        ],
      },
      content: await this.crypto.encryptVaultSnapshotContent(
        registeredVault,
        vaultMasterKey,
      ),
    };
    const registeredVaultSnapshot: VaultSnapshot = {
      ...unsignedVaultSnapshot,
      signature: await this.crypto.signVaultSnapshot(
        unsignedVaultSnapshot,
        devicePrivateSignKey,
      ),
    };
    try {
      await this.vaultTrust.verifySnapshot(
        enrollmentBundle.vaultId,
        registeredVaultSnapshot,
        verifiedTrust,
      );
    } catch (error) {
      throw new DeviceEnrollmentIntegrityError(
        enrollmentBundle.vaultId,
        "pending device cannot authenticate the completed snapshot",
        { cause: error },
      );
    }

    const deviceAccessMaterial: DeviceAccessMaterial = {
      vaultId: enrollmentBundle.vaultId,
      deviceId,
      algorithmSuiteId: this.crypto.algorithmSuite.id,
      masterPasswordSalt,
      localKeysProtectionSalt,
      devicePublicSignKey,
      protectedLocalKeys,
    };
    const deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup = {
      vaultId: enrollmentBundle.vaultId,
      deviceId,
      algorithmSuiteId: this.crypto.algorithmSuite.id,
      recoveryLocalKeysProtectionSalt,
      devicePublicSignKey,
      protectedLocalKeys: recoveryProtectedLocalKeys,
    };
    const localVaultDescriptor: LocalVaultDescriptor = {
      vaultId: enrollmentBundle.vaultId,
      displayName: vaultDisplayName,
      createdAt: revisionTimestamp,
    };
    const unlockedVault: UnlockedVault = {
      vaultId: enrollmentBundle.vaultId,
      deviceId,
      vault: registeredVault,
      vaultMasterKey,
      devicePrivateSignKey,
      trustedSnapshotContext: {
        snapshotDigest: await this.crypto.digestVaultSnapshot(
          registeredVaultSnapshot,
        ),
        trust: verifiedTrust,
      },
      vaultTrustAnchor: enrollmentBundle.vaultTrustAnchor,
    };
    const checkpoint = await this.vaultTrust.createCheckpoint(
      registeredVaultSnapshot,
      verifiedTrust,
      deviceId,
      devicePrivateSignKey,
    );

    await this.vaultLocalRepository.saveInitializedLocalVault({
      descriptor: localVaultDescriptor,
      deviceAccessMaterial,
      deviceAccessRecoveryBackup,
      snapshot: registeredVaultSnapshot,
      checkpoint,
    });

    try {
      await this.unlockedVaultSession.commit(
        unlockedVault,
        registeredVaultSnapshot.metadata.snapshotVersionVector,
      );
    } catch (error) {
      try {
        await this.vaultLocalRepository.removePersistedLocalVault(
          enrollmentBundle.vaultId,
        );
      } catch {
        // Preserve the session activation failure as the root cause.
      }

      throw error;
    }

    try {
      await this.syncProvider.uploadVaultSnapshot(
        enrollmentBundle.syncConfig,
        registeredVaultSnapshot,
        remoteSnapshotDescriptor,
      );
    } catch (error) {
      const mappedError =
        error instanceof RemoteVaultSnapshotChangedError
          ? new SyncConflictDetectedError(enrollmentBundle.vaultId)
          : error;

      try {
        await this.unlockedVaultSession.remove();
      } catch {
        // Preserve the upload failure as the root cause.
      }

      try {
        await this.vaultLocalRepository.removePersistedLocalVault(
          enrollmentBundle.vaultId,
        );
      } catch {
        // Preserve the upload failure as the root cause.
      }

      throw mappedError;
    }

    return {
      vault: registeredVault,
      snapshotVersionVector:
        registeredVaultSnapshot.metadata.snapshotVersionVector,
      revisionTimestamp: registeredVaultSnapshot.metadata.revisionTimestamp,
      deviceId: registeredVaultSnapshot.metadata.createdByDeviceId,
      recoveryMnemonicKey,
    };
  }
}
