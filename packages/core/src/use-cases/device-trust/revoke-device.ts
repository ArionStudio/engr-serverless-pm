import { areJsonEqual } from "../../domain/common";
import type {
  DeviceSyncCredentialState,
  EncryptedDeviceSyncCredentialState,
} from "../../domain/sync";
import type { SyncAccess, SyncSetupInput } from "../../domain/sync";
import { requireDeviceProfilesMatchTrust } from "../../domain/sync/device-profile-review.utils";
import { areVaultSnapshotDescriptorsEqual } from "../../domain/snapshot";
import type { VisibleVaultFields } from "../../domain/vault";
import { toVisibleVaultFields } from "../../domain/vault/visible-vault.mapper";
import { revokeDeviceProfileFromVault } from "../../domain/vault/vault-device.mutations";
import { markVaultProviderCredentialRevocationPending } from "../../domain/vault/vault-sync-config.mutations";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import {
  InvalidSyncConfigError,
  LocalSyncCredentialsMissingError,
  ReplacementSyncCredentialsRequiredError,
  ReplacementSyncCredentialsUnchangedError,
  ReplacementSyncTargetMismatchError,
} from "../../errors/sync.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../../services/sync";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import {
  CannotRevokeCurrentDeviceError,
  DeviceToRevokeNotTrustedError,
  InvalidDeviceRevocationTransitionError,
} from "../../errors/device-revocation.errors";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";

export type RevokeDeviceCommandParams = {
  readonly vaultId: string;
  readonly deviceId: string;
  readonly replacementSyncConfig?: SyncSetupInput;
};

export type RevokeDeviceResult = {
  readonly vault: VisibleVaultFields;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
  readonly providerCredentialRevocation:
    | "not_configured"
    | "pending_external_deletion";
  readonly syncUpload: SyncUploadStatus;
};

export class RevokeDeviceUseCase {
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async execute(
    params: RevokeDeviceCommandParams,
  ): Promise<RevokeDeviceResult> {
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "revoke device",
      );

    if (params.deviceId === unlockedVault.deviceId) {
      throw new CannotRevokeCurrentDeviceError(params.vaultId, params.deviceId);
    }

    const targetIdentity =
      unlockedVault.trustedSnapshotContext.trust.trustedDevices.find(
        (device) => device.deviceId === params.deviceId,
      );

    if (targetIdentity === undefined) {
      throw new DeviceToRevokeNotTrustedError(params.vaultId, params.deviceId);
    }

    await this.vaultSyncGuard.requireProviderCredentialRevocationComplete(
      params.vaultId,
      unlockedVault,
      "revoke another device",
    );
    const syncState = await this.vaultSyncGuard.prepareLocalMutation(
      params.vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );
    const currentSnapshot = syncState.localSnapshot;

    try {
      requireDeviceProfilesMatchTrust(
        unlockedVault.vault,
        new Set(
          unlockedVault.trustedSnapshotContext.trust.trustedDevices.map(
            (device) => device.deviceId,
          ),
        ),
        new Set(
          currentSnapshot.trustChain.certificates.flatMap((certificate) =>
            certificate.payload.trustedDevices.map((device) => device.deviceId),
          ),
        ),
      );
    } catch (error) {
      throw new InvalidDeviceRevocationTransitionError(
        params.vaultId,
        "device profiles do not match the trusted identities",
        { cause: error },
      );
    }

    const targetSlots = currentSnapshot.keySlots.deviceSlots.filter(
      (slot) => slot.deviceId === params.deviceId,
    );

    if (targetSlots.length !== 1) {
      throw new DeviceToRevokeNotTrustedError(params.vaultId, params.deviceId);
    }

    const vaultKeyGeneration = currentSnapshot.metadata.vaultKeyGeneration + 1;
    let previousEncryptedCredentials: EncryptedDeviceSyncCredentialState | null =
      null;
    let replacementAccess: SyncAccess | undefined;
    let stagedCredentialState: DeviceSyncCredentialState | undefined;
    let encryptedCredentialState:
      | EncryptedDeviceSyncCredentialState
      | undefined;

    if (unlockedVault.vault.syncTarget !== undefined) {
      if (params.replacementSyncConfig === undefined) {
        throw new ReplacementSyncCredentialsRequiredError(params.vaultId);
      }

      if (syncState.syncAccess === undefined) {
        throw new LocalSyncCredentialsMissingError(params.vaultId);
      }
      previousEncryptedCredentials = syncState.syncCredentialState;

      const previousState = await this.crypto.decryptDeviceSyncCredentialState(
        previousEncryptedCredentials,
        unlockedVault.deviceLocalProtectionKey,
        {
          vaultId: params.vaultId,
          deviceId: unlockedVault.deviceId,
          provider: unlockedVault.vault.syncTarget.provider,
          target: unlockedVault.vault.syncTarget,
        },
      );

      if (previousState.previousCredentials !== undefined) {
        throw new InvalidDeviceRevocationTransitionError(
          params.vaultId,
          "provider credential revocation is already pending",
        );
      }

      try {
        replacementAccess = await this.syncProvider.setup(
          params.replacementSyncConfig,
        );
      } catch {
        throw new InvalidSyncConfigError();
      }

      if (
        !areJsonEqual(replacementAccess.target, unlockedVault.vault.syncTarget)
      ) {
        throw new ReplacementSyncTargetMismatchError(params.vaultId);
      }

      if (
        areJsonEqual(
          replacementAccess.credentials,
          previousState.currentCredentials,
        )
      ) {
        throw new ReplacementSyncCredentialsUnchangedError(params.vaultId);
      }

      const replacementRemoteDescriptor =
        await this.syncProvider.getLatestVaultSnapshotDescriptor(
          replacementAccess,
          params.vaultId,
        );

      if (
        replacementRemoteDescriptor === null ||
        syncState.remoteSnapshotIdentity === undefined ||
        !areVaultSnapshotDescriptorsEqual(
          replacementRemoteDescriptor,
          syncState.remoteSnapshotIdentity.descriptor,
        )
      ) {
        throw new ReplacementSyncTargetMismatchError(params.vaultId);
      }

      stagedCredentialState = {
        currentCredentials: replacementAccess.credentials,
        previousCredentials: {
          credentials: previousState.currentCredentials,
          revokedDeviceIds: [params.deviceId],
          vaultKeyGeneration,
        },
      };
    } else if (params.replacementSyncConfig !== undefined) {
      throw new ReplacementSyncTargetMismatchError(params.vaultId);
    }

    const revokedProfileVault = revokeDeviceProfileFromVault(
      unlockedVault.vault,
      unlockedVault.deviceId,
      params.deviceId,
      this.clock.now(),
    );
    const revokedVault =
      replacementAccess === undefined
        ? revokedProfileVault
        : markVaultProviderCredentialRevocationPending(
            revokedProfileVault,
            [params.deviceId],
            vaultKeyGeneration,
          );
    const survivors =
      unlockedVault.trustedSnapshotContext.trust.trustedDevices.filter(
        (device) => device.deviceId !== params.deviceId,
      );
    const nextTrust = await this.vaultTrust.appendTrustTransition(
      params.vaultId,
      currentSnapshot.trustChain,
      unlockedVault.trustedSnapshotContext.trust,
      survivors,
      vaultKeyGeneration,
      unlockedVault.deviceId,
      unlockedVault.devicePrivateSignKey,
    );
    const vaultMasterKey = await this.crypto.generateVaultMasterKey();
    let vaultMasterKeyTransferred = false;

    try {
      const deviceSlots = await Promise.all(
        survivors.map(async (device) => ({
          deviceId: device.deviceId,
          vaultKeyGeneration,
          envelope: await this.crypto.createDeviceVaultKeyEnvelope(
            vaultMasterKey,
            device.publicVaultKey,
            {
              vaultId: params.vaultId,
              deviceId: device.deviceId,
              vaultKeyGeneration,
              algorithmSuiteId: this.crypto.algorithmSuite.id,
            },
          ),
        })),
      );
      const rotatedUnlockedVault = {
        ...unlockedVault,
        vault: revokedVault,
        vaultMasterKey,
      };

      if (
        stagedCredentialState !== undefined &&
        replacementAccess !== undefined
      ) {
        encryptedCredentialState =
          await this.crypto.encryptDeviceSyncCredentialState(
            stagedCredentialState,
            unlockedVault.deviceLocalProtectionKey,
            {
              vaultId: params.vaultId,
              deviceId: unlockedVault.deviceId,
              provider: replacementAccess.target.provider,
              target: replacementAccess.target,
            },
          );
      }

      const { persistedSnapshot, preparedRestore } =
        await this.unlockedVaultSession.persistForActiveSession(
          sessionId,
          params.vaultId,
          async () => {
            const preparedRestore =
              await this.vaultSnapshot.prepareLocalVaultSnapshotRestore(
                currentSnapshot,
                unlockedVault,
                previousEncryptedCredentials,
              );
            const snapshotOptions =
              encryptedCredentialState === undefined
                ? {
                    vaultKeyGeneration,
                    keySlots: { deviceSlots },
                    nextTrust: {
                      chain: nextTrust.chain,
                      state: nextTrust.trust,
                    },
                    ...(syncState.remoteSnapshotIdentity === undefined
                      ? {}
                      : {
                          uploadExpectedRemoteSnapshotIdentity:
                            syncState.remoteSnapshotIdentity,
                        }),
                  }
                : {
                    vaultKeyGeneration,
                    keySlots: { deviceSlots },
                    nextTrust: {
                      chain: nextTrust.chain,
                      state: nextTrust.trust,
                    },
                    ...(syncState.remoteSnapshotIdentity === undefined
                      ? {}
                      : {
                          uploadExpectedRemoteSnapshotIdentity:
                            syncState.remoteSnapshotIdentity,
                        }),
                    expectedSyncCredentialState:
                      previousEncryptedCredentials ?? null,
                    syncCredentialState: encryptedCredentialState,
                  };
            const persistedSnapshot =
              await this.vaultSnapshot.persistUnlockedVault(
                params.vaultId,
                rotatedUnlockedVault,
                sourceSnapshotVersionVector,
                snapshotOptions,
              );

            return { persistedSnapshot, preparedRestore };
          },
        );

      let syncUpload: SyncUploadStatus = "complete";
      let sessionCommitted: boolean;

      if (
        replacementAccess !== undefined &&
        syncState.remoteSnapshotIdentity !== undefined
      ) {
        if (encryptedCredentialState === undefined) {
          throw new InvalidDeviceRevocationTransitionError(
            params.vaultId,
            "replacement credential state was not prepared",
          );
        }

        syncUpload = await this.vaultSyncGuard.uploadPersistedSnapshot({
          vaultId: params.vaultId,
          syncAccess: replacementAccess,
          persistedSnapshot: persistedSnapshot.snapshot,
          expectedRemoteSnapshotIdentity: syncState.remoteSnapshotIdentity,
          previousSnapshotVersionVector: sourceSnapshotVersionVector,
          persistedSnapshotDigest:
            persistedSnapshot.trustedSnapshotContext.snapshotDigest,
          checkpoint: persistedSnapshot.checkpoint,
          persistedSyncCredentialState: encryptedCredentialState,
          unlockedVault: rotatedUnlockedVault,
          preparedRestore,
          sessionId,
        });

        sessionCommitted =
          await this.unlockedVaultSession.commitPersistedSnapshotIfSessionIsActive(
            sessionId,
            {
              ...rotatedUnlockedVault,
              trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
            },
            persistedSnapshot.snapshotVersionVector,
          );
      } else {
        await this.unlockedVaultSession.commitPersistedSnapshot(
          sessionId,
          {
            ...rotatedUnlockedVault,
            trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
          },
          persistedSnapshot.snapshotVersionVector,
        );
        sessionCommitted = true;
      }
      vaultMasterKeyTransferred = sessionCommitted;

      return {
        vault: toVisibleVaultFields(revokedVault),
        snapshotVersionVector: {
          ...persistedSnapshot.snapshotVersionVector,
        },
        revisionTimestamp: persistedSnapshot.revisionTimestamp,
        providerCredentialRevocation:
          replacementAccess === undefined
            ? "not_configured"
            : "pending_external_deletion",
        syncUpload,
      };
    } finally {
      if (!vaultMasterKeyTransferred) {
        bestEffortWipeArrayBuffers([vaultMasterKey]);
      }
    }
  }
}
