import type { DeviceEnrollmentBundle } from "../../domain/device-trust/device-enrollment-bundle";
import {
  areVaultSnapshotDescriptorsEqual,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import { DeviceEnrollmentVaultNotSynchronizedError } from "../../errors/device-enrollment.errors";
import {
  RemoteVaultSnapshotChangedError,
  SyncConflictDetectedError,
  SyncNotConfiguredError,
  SyncRemovalPendingError,
} from "../../errors/sync.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSyncGuardService } from "../../services/sync";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { DeviceEnrollmentAuthorizationPayload } from "../../domain/device-trust";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";

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
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    crypto: CryptoPort,
    ids: IdPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.crypto = crypto;
    this.ids = ids;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultTrust = new VaultTrustService(crypto);
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

    if (unlockedVault.vault.syncRemovalPending === true) {
      throw new SyncRemovalPendingError(
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

    const enrollmentSecret = await this.crypto.generateDeviceEnrollmentSecret();
    const enrollmentId = await this.ids.generateId();
    const pendingDeviceId = await this.ids.generateId();
    const pendingDeviceSignKeyPair =
      await this.crypto.generateDeviceSignKeyPair();
    const currentTrustChain = currentVaultSnapshot.trustChain;

    if (currentTrustChain === undefined) {
      throw new VaultTrustStateInvalidError(
        params.vaultId,
        "trust chain is missing",
      );
    }

    const nextTrust = await this.vaultTrust.appendTrustTransition(
      params.vaultId,
      currentTrustChain,
      unlockedVault.trustedSnapshotContext.trust,
      [
        ...unlockedVault.trustedSnapshotContext.trust.trustedDevices,
        {
          deviceId: pendingDeviceId,
          publicSignKey: pendingDeviceSignKeyPair.publicKey,
        },
      ],
      unlockedVault.deviceId,
      unlockedVault.devicePrivateSignKey,
    );
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
      protectedVaultMasterKeyDigest,
    };
    const authorizerSignature =
      await this.crypto.signDeviceEnrollmentAuthorization(
        enrollmentAuthorization,
        unlockedVault.devicePrivateSignKey,
      );
    const persistedSnapshot = await this.vaultSnapshot.persistUnlockedVault(
      params.vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
      {
        keySlots: {
          deviceSlots: currentVaultSnapshot.keySlots.deviceSlots,
          ...(currentVaultSnapshot.keySlots.completedEnrollments === undefined
            ? {}
            : {
                completedEnrollments:
                  currentVaultSnapshot.keySlots.completedEnrollments,
              }),
          enrollmentKeySlot: {
            enrollmentId,
            pendingDeviceId,
            pendingDevicePublicSignKey: pendingDeviceSignKeyPair.publicKey,
            pendingDevicePublicSignKeyDigest,
            protectedVaultMasterKeyDigest,
            protectedVaultMasterKey: protectedEnrollmentVaultMasterKey,
            authorizedByDeviceId: unlockedVault.deviceId,
            authorizerSignature,
          },
        },
        nextTrust: {
          chain: nextTrust.chain,
          state: nextTrust.trust,
        },
      },
    );
    const nextUnlockedVault = {
      ...unlockedVault,
      trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
    };

    try {
      await this.unlockedVaultSession.commitPersistedSnapshot(
        nextUnlockedVault,
        persistedSnapshot.snapshotVersionVector,
      );
    } catch (error) {
      try {
        await this.vaultSnapshot.restoreLocalVaultSnapshot(
          currentVaultSnapshot,
          persistedSnapshot.snapshot,
          unlockedVault,
        );
      } catch {
        // Preserve the session commit failure as the root cause.
      }

      throw error;
    }

    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncConfig,
        persistedSnapshot.snapshot,
        params.remoteSnapshotDescriptor,
      );
    } catch (error) {
      const mappedError =
        error instanceof RemoteVaultSnapshotChangedError
          ? new SyncConflictDetectedError(params.vaultId)
          : error;
      let restored = false;

      try {
        await this.vaultSnapshot.restoreLocalVaultSnapshot(
          currentVaultSnapshot,
          persistedSnapshot.snapshot,
          unlockedVault,
        );
        restored = true;
      } catch {
        try {
          await this.unlockedVaultSession.remove();
        } catch {
          // Preserve the upload failure as the root cause.
        }
      }

      if (restored) {
        try {
          await this.unlockedVaultSession.commitPersistedSnapshot(
            unlockedVault,
            sourceSnapshotVersionVector,
          );
        } catch {
          // Preserve the upload failure as the root cause.
        }
      }

      throw mappedError;
    }

    return {
      enrollmentBundle: {
        version: 1,
        vaultId: params.vaultId,
        syncConfig,
        snapshotVersionVector: persistedSnapshot.snapshotVersionVector,
        revisionTimestamp: persistedSnapshot.revisionTimestamp,
        enrollmentSecret,
        pendingDevicePrivateSignKey: pendingDeviceSignKeyPair.privateKey,
        vaultTrustAnchor: unlockedVault.vaultTrustAnchor,
      },
      snapshotVersionVector: persistedSnapshot.snapshotVersionVector,
      revisionTimestamp: persistedSnapshot.revisionTimestamp,
    };
  }
}
