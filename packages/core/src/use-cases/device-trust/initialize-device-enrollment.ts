import type { DeviceEnrollmentBundle } from "../../domain/device-trust/device-enrollment-bundle";
import {
  areVaultSnapshotDescriptorsEqual,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import { DeviceEnrollmentVaultNotSynchronizedError } from "../../errors/device-enrollment.errors";
import { SyncNotConfiguredError } from "../../errors/sync.errors";
import {
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../errors/unlock-vault.errors";
import { SnapshotSigningDeviceNotTrustedError } from "../../errors/vault-snapshot.errors";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";

export type InitializeDeviceEnrollmentCommandParams = {
  readonly vaultId: string;
  readonly remoteSnapshotDescriptor: VaultSnapshotDescriptor;
};

export type InitializeDeviceEnrollmentResult = {
  readonly enrollmentBundle: DeviceEnrollmentBundle;
  readonly revision: number;
  readonly revisionTimestamp: number;
};

export class InitializeDeviceEnrollmentUseCase {
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultLocalRepository: VaultLocalRepositoryPort,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultLocalRepository = vaultLocalRepository;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(
    params: InitializeDeviceEnrollmentCommandParams,
  ): Promise<InitializeDeviceEnrollmentResult> {
    const { sourceSnapshotRevision, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "initialize device enrollment",
      );
    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(
        params.vaultId,
        "initialize device enrollment",
      );
    }

    const currentVaultSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        unlockedVault,
        sourceSnapshotRevision,
      );
    const localSnapshotDescriptor = toVaultSnapshotDescriptor(
      currentVaultSnapshot.metadata.id,
      unlockedVault.vault,
      currentVaultSnapshot,
    );

    if (
      !areVaultSnapshotDescriptorsEqual(
        localSnapshotDescriptor,
        params.remoteSnapshotDescriptor,
      )
    ) {
      throw new DeviceEnrollmentVaultNotSynchronizedError(params.vaultId);
    }

    const signerDevice = currentVaultSnapshot.trustedDevices.find(
      (device) => device.id === currentVaultSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        params.vaultId,
        currentVaultSnapshot.metadata.createdByDeviceId,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      currentVaultSnapshot,
      signerDevice.publicKeys.signingKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(params.vaultId);
    }

    const currentTrustedDevice = currentVaultSnapshot.trustedDevices.find(
      (device) => device.id === unlockedVault.deviceId,
    );

    if (currentTrustedDevice === undefined) {
      throw new SnapshotSigningDeviceNotTrustedError(
        params.vaultId,
        unlockedVault.deviceId,
      );
    }

    const enrollmentSecret = await this.crypto.generateDeviceEnrollmentSecret();
    const enrollmentVaultMasterKeyProtectionKey =
      await this.crypto.deriveEnrollmentVaultMasterKeyProtectionKey(
        enrollmentSecret,
      );
    const protectedEnrollmentVaultMasterKey =
      await this.crypto.wrapVaultMasterKey(
        unlockedVault.vaultMasterKey,
        enrollmentVaultMasterKeyProtectionKey,
      );
    const revisionTimestamp = this.clock.now();
    const unsignedVaultSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        ...currentVaultSnapshot.metadata,
        revision: currentVaultSnapshot.metadata.revision + 1,
        revisionTimestamp,
        createdByDeviceId: unlockedVault.deviceId,
      },
      trustedDevices: currentVaultSnapshot.trustedDevices,
      keySlots: {
        deviceSlots: currentVaultSnapshot.keySlots.deviceSlots,
        recoveryKeySlot: currentVaultSnapshot.keySlots.recoveryKeySlot,
        enrollmentKeySlot: {
          protectedVaultMasterKey: protectedEnrollmentVaultMasterKey,
        },
      },
      content: await this.crypto.encryptVaultSnapshotContent(
        unlockedVault.vault,
        unlockedVault.vaultMasterKey,
      ),
    };
    const enrollmentVaultSnapshot: VaultSnapshot = {
      ...unsignedVaultSnapshot,
      signature: await this.crypto.signVaultSnapshot(
        unsignedVaultSnapshot,
        unlockedVault.devicePrivateSignKey,
      ),
    };
    await this.vaultLocalRepository.saveVaultSnapshot(enrollmentVaultSnapshot);
    await this.unlockedVaultSession.commitPersistedSnapshot(
      unlockedVault,
      enrollmentVaultSnapshot.metadata.revision,
    );

    return {
      enrollmentBundle: {
        version: 1,
        vaultId: params.vaultId,
        syncConfig,
        snapshotSignerPublicKey: currentTrustedDevice.publicKeys.signingKey,
        enrollmentSecret,
      },
      revision: enrollmentVaultSnapshot.metadata.revision,
      revisionTimestamp: enrollmentVaultSnapshot.metadata.revisionTimestamp,
    };
  }
}
