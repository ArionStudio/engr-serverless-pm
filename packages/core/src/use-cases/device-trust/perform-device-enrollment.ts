import type {
  CompletedDeviceEnrollmentProof,
  DeviceEnrollmentAuthorizationPayload,
} from "../../domain/device-trust";
import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { DeviceEnrollmentBundle } from "../../domain/device-trust/device-enrollment-bundle";
import type { LocalKeysPayload } from "../../domain/device-trust/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
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
  DeviceEnrollmentExpiredError,
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
import { VaultSnapshotSignatureVerificationFailedError } from "../../errors/unlock-vault.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VaultDisplayNamePort } from "../../ports/vault/vault-display-name.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

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
};

export class PerformDeviceEnrollmentUseCase {
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultDisplayName: VaultDisplayNamePort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultDisplayName: VaultDisplayNamePort,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultDisplayName = vaultDisplayName;
    this.vaultLocalRepository = vaultLocalRepository;
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

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      remoteSnapshot,
      enrollmentBundle.snapshotSignerPublicKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(
        enrollmentBundle.vaultId,
      );
    }

    const enrollmentKeySlot = remoteSnapshot.keySlots.enrollmentKeySlot;

    if (enrollmentKeySlot === undefined) {
      throw new DeviceEnrollmentKeySlotNotFoundError(enrollmentBundle.vaultId);
    }

    const revisionTimestamp = this.clock.now();

    if (revisionTimestamp > enrollmentKeySlot.expiresAt) {
      throw new DeviceEnrollmentExpiredError(enrollmentBundle.vaultId);
    }

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

    const authorizerDevice = remoteSnapshot.keySlots.deviceSlots.find(
      (deviceSlot) =>
        deviceSlot.deviceId === enrollmentKeySlot.authorizedByDeviceId,
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
      expiresAt: enrollmentKeySlot.expiresAt,
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
    };
    const protectedLocalKeys = await this.crypto.wrapLocalKeysPayload(
      localKeysPayload,
      localKeysProtectionKey,
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
      keySlots: {
        deviceSlots: [
          ...remoteSnapshot.keySlots.deviceSlots,
          {
            deviceId,
            protectedVaultMasterKey: protectedDeviceVaultMasterKey,
            publicSignKey: devicePublicSignKey,
          },
        ],
        recoveryKeySlot: remoteSnapshot.keySlots.recoveryKeySlot,
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
    const isRegisteredSnapshotAuthentic =
      await this.crypto.verifyVaultSnapshotSignature(
        registeredVaultSnapshot,
        devicePublicSignKey,
      );

    if (!isRegisteredSnapshotAuthentic) {
      throw new DeviceEnrollmentIntegrityError(
        enrollmentBundle.vaultId,
        "pending device private key does not match the enrolled public key",
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
    };

    await this.vaultLocalRepository.saveInitializedLocalVault(
      localVaultDescriptor,
      deviceAccessMaterial,
      registeredVaultSnapshot,
    );

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
    };
  }
}
