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
import {
  RemoteVaultSnapshotChangedError,
  SyncConflictDetectedError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import {
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../errors/unlock-vault.errors";
import { SnapshotSigningDeviceNotTrustedError } from "../../errors/vault-snapshot.errors";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSyncGuardService } from "../../services/sync";
import { incrementVersionVector } from "../../domain/versioning/version-vector.utils";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";

export type InitializeDeviceEnrollmentCommandParams = {
  readonly vaultId: string;
  readonly remoteSnapshotDescriptor: VaultSnapshotDescriptor;
};

export type InitializeDeviceEnrollmentResult = {
  readonly enrollmentBundle: DeviceEnrollmentBundle;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
};

export class InitializeDeviceEnrollmentUseCase {
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultLocalRepository = vaultLocalRepository;
  }

  async execute(
    params: InitializeDeviceEnrollmentCommandParams,
  ): Promise<InitializeDeviceEnrollmentResult> {
    const { sourceSnapshotVersionVector, unlockedVault } =
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
      await this.vaultSyncGuard.requireReadyForLocalMutation(
        params.vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );
    const localSnapshotDescriptor = toVaultSnapshotDescriptor(
      params.vaultId,
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

    const signerDevice = currentVaultSnapshot.keySlots.deviceSlots.find(
      (deviceSlot) =>
        deviceSlot.deviceId === currentVaultSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        params.vaultId,
        currentVaultSnapshot.metadata.createdByDeviceId,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      currentVaultSnapshot,
      signerDevice.publicSignKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(params.vaultId);
    }

    const currentTrustedDevice = currentVaultSnapshot.keySlots.deviceSlots.find(
      (deviceSlot) => deviceSlot.deviceId === unlockedVault.deviceId,
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
        id: params.vaultId,
        revisionTimestamp,
        snapshotVersionVector: incrementVersionVector(
          currentVaultSnapshot.metadata.snapshotVersionVector,
          unlockedVault.deviceId,
        ),
        createdByDeviceId: unlockedVault.deviceId,
      },
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
      enrollmentVaultSnapshot.metadata.snapshotVersionVector,
    );

    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncConfig,
        enrollmentVaultSnapshot,
        params.remoteSnapshotDescriptor,
      );
    } catch (error) {
      await this.vaultLocalRepository.saveVaultSnapshot(currentVaultSnapshot);
      await this.unlockedVaultSession.commitPersistedSnapshot(
        unlockedVault,
        sourceSnapshotVersionVector,
      );

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }

    return {
      enrollmentBundle: {
        version: 1,
        vaultId: params.vaultId,
        syncConfig,
        snapshotVersionVector:
          enrollmentVaultSnapshot.metadata.snapshotVersionVector,
        revisionTimestamp: enrollmentVaultSnapshot.metadata.revisionTimestamp,
        snapshotSignerPublicKey: currentTrustedDevice.publicSignKey,
        enrollmentSecret,
      },
      snapshotVersionVector:
        enrollmentVaultSnapshot.metadata.snapshotVersionVector,
      revisionTimestamp: enrollmentVaultSnapshot.metadata.revisionTimestamp,
    };
  }
}
