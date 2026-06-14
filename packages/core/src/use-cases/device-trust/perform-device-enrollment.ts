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
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
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
import type { IdPort } from "../../ports/system/id.port";
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
  readonly revision: number;
  readonly revisionTimestamp: number;
  readonly deviceId: string;
};

export class PerformDeviceEnrollmentUseCase {
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultDisplayName: VaultDisplayNamePort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    ids: IdPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultDisplayName: VaultDisplayNamePort,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.ids = ids;
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
      remoteSnapshot.metadata.id,
      vault,
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

    const deviceId = await this.ids.generateId();
    const timestamp = this.clock.now();
    const vaultDisplayName =
      await this.vaultDisplayName.generateVaultDisplayName();
    const deviceSlotKey = await this.crypto.generateDeviceSlotKey();
    const deviceSignKeyPair = await this.crypto.generateDeviceSignKeyPair();
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
      devicePrivateSignKey: deviceSignKeyPair.privateKey,
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
      timestamp,
    );
    const unsignedVaultSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        ...remoteSnapshot.metadata,
        revision: remoteSnapshot.metadata.revision + 1,
        revisionTimestamp: timestamp,
        createdByDeviceId: deviceId,
      },
      trustedDevices: [
        ...remoteSnapshot.trustedDevices,
        {
          id: deviceId,
          publicKeys: {
            signingKey: deviceSignKeyPair.publicKey,
          },
        },
      ],
      keySlots: {
        deviceSlots: [
          ...remoteSnapshot.keySlots.deviceSlots,
          {
            deviceId,
            protectedVaultMasterKey: protectedDeviceVaultMasterKey,
          },
        ],
        recoveryKeySlot: remoteSnapshot.keySlots.recoveryKeySlot,
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
        deviceSignKeyPair.privateKey,
      ),
    };
    const deviceAccessMaterial: DeviceAccessMaterial = {
      vaultId: enrollmentBundle.vaultId,
      deviceId,
      algorithmSuiteId: this.crypto.algorithmSuite.id,
      masterPasswordSalt,
      localKeysProtectionSalt,
      devicePublicSignKey: deviceSignKeyPair.publicKey,
      protectedLocalKeys,
    };
    const localVaultDescriptor: LocalVaultDescriptor = {
      vaultId: enrollmentBundle.vaultId,
      displayName: vaultDisplayName,
      createdAt: timestamp,
    };
    const unlockedVault: UnlockedVault = {
      vaultId: enrollmentBundle.vaultId,
      deviceId,
      vault: registeredVault,
      vaultMasterKey,
      devicePrivateSignKey: deviceSignKeyPair.privateKey,
    };

    await this.vaultLocalRepository.saveInitializedLocalVault(
      localVaultDescriptor,
      deviceAccessMaterial,
      registeredVaultSnapshot,
    );

    try {
      await this.unlockedVaultSession.commit(
        unlockedVault,
        registeredVaultSnapshot.metadata.revision,
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
      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(enrollmentBundle.vaultId);
      }

      throw error;
    }

    return {
      vault: registeredVault,
      revision: registeredVaultSnapshot.metadata.revision,
      revisionTimestamp: registeredVaultSnapshot.metadata.revisionTimestamp,
      deviceId: registeredVaultSnapshot.metadata.createdByDeviceId,
    };
  }
}
