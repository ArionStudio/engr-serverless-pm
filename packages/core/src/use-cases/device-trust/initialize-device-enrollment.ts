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
import type { IdPort } from "../../ports/system/id.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSyncGuardService } from "../../services/sync";
import { incrementVersionVector } from "../../domain/versioning/version-vector.utils";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { DeviceEnrollmentAuthorizationPayload } from "../../domain/device-trust";

const DEFAULT_DEVICE_ENROLLMENT_TTL_MS = 300_000;

export type InitializeDeviceEnrollmentCommandParams = {
  readonly vaultId: string;
  readonly remoteSnapshotDescriptor: VaultSnapshotDescriptor;
  readonly expiresAt?: number;
};

export type InitializeDeviceEnrollmentResult = {
  readonly enrollmentBundle: DeviceEnrollmentBundle;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
};

export class InitializeDeviceEnrollmentUseCase {
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    ids: IdPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.ids = ids;
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

    const revisionTimestamp = this.clock.now();
    const expiresAt =
      params.expiresAt ?? revisionTimestamp + DEFAULT_DEVICE_ENROLLMENT_TTL_MS;
    const enrollmentSecret = await this.crypto.generateDeviceEnrollmentSecret();
    const enrollmentId = await this.ids.generateId();
    const pendingDeviceId = await this.ids.generateId();
    const pendingDeviceSignKeyPair =
      await this.crypto.generateDeviceSignKeyPair();
    const pendingDevicePublicSignKeyDigest =
      await this.crypto.digestDevicePublicSignKey(
        pendingDeviceSignKeyPair.publicKey,
      );
    const enrollmentVaultMasterKeyProtectionKey =
      await this.crypto.deriveEnrollmentVaultMasterKeyProtectionKey(
        enrollmentSecret,
      );
    const protectedEnrollmentVaultMasterKey =
      await this.crypto.wrapVaultMasterKey(
        unlockedVault.vaultMasterKey,
        enrollmentVaultMasterKeyProtectionKey,
      );
    const protectedVaultMasterKeyDigest =
      await this.crypto.digestProtectedVaultMasterKey(
        protectedEnrollmentVaultMasterKey,
      );
    const enrollmentAuthorization: DeviceEnrollmentAuthorizationPayload = {
      version: 1,
      vaultId: params.vaultId,
      enrollmentId,
      pendingDeviceId,
      pendingDevicePublicSignKeyDigest,
      expiresAt,
      protectedVaultMasterKeyDigest,
    };
    const authorizerSignature =
      await this.crypto.signDeviceEnrollmentAuthorization(
        enrollmentAuthorization,
        unlockedVault.devicePrivateSignKey,
      );
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
        completedEnrollments:
          currentVaultSnapshot.keySlots.completedEnrollments,
        enrollmentKeySlot: {
          enrollmentId,
          pendingDeviceId,
          pendingDevicePublicSignKey: pendingDeviceSignKeyPair.publicKey,
          pendingDevicePublicSignKeyDigest,
          expiresAt,
          protectedVaultMasterKeyDigest,
          protectedVaultMasterKey: protectedEnrollmentVaultMasterKey,
          authorizedByDeviceId: unlockedVault.deviceId,
          authorizerSignature,
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
    try {
      await this.unlockedVaultSession.commitPersistedSnapshot(
        unlockedVault,
        enrollmentVaultSnapshot.metadata.snapshotVersionVector,
      );
    } catch (error) {
      try {
        await this.vaultLocalRepository.saveVaultSnapshot(currentVaultSnapshot);
      } catch {
        // Preserve the session commit failure as the root cause.
      }

      throw error;
    }

    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncConfig,
        enrollmentVaultSnapshot,
        params.remoteSnapshotDescriptor,
      );
    } catch (error) {
      const mappedError =
        error instanceof RemoteVaultSnapshotChangedError
          ? new SyncConflictDetectedError(params.vaultId)
          : error;

      try {
        await this.vaultLocalRepository.saveVaultSnapshot(currentVaultSnapshot);
      } catch {
        // Preserve the upload failure as the root cause.
      }

      try {
        await this.unlockedVaultSession.commitPersistedSnapshot(
          unlockedVault,
          sourceSnapshotVersionVector,
        );
      } catch {
        // Preserve the upload failure as the root cause.
      }

      throw mappedError;
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
        pendingDevicePrivateSignKey: pendingDeviceSignKeyPair.privateKey,
      },
      snapshotVersionVector:
        enrollmentVaultSnapshot.metadata.snapshotVersionVector,
      revisionTimestamp: enrollmentVaultSnapshot.metadata.revisionTimestamp,
    };
  }
}
