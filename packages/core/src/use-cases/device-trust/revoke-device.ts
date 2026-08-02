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
import {
  InvalidSyncConfigError,
  LocalSyncCredentialsMissingError,
  RemoteVaultSnapshotChangedError,
  ReplacementSyncCredentialsRequiredError,
  ReplacementSyncCredentialsUnchangedError,
  ReplacementSyncTargetMismatchError,
  SyncConflictDetectedError,
} from "../../errors/sync.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../../services/sync";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import {
  CannotRevokeCurrentDeviceError,
  DeviceToRevokeNotTrustedError,
  InvalidDeviceRevocationTransitionError,
} from "../../errors/device-revocation.errors";

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
    | "pending_external_disable";
};

export class RevokeDeviceUseCase {
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultSnapshot: VaultSnapshotService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultLocalRepository = vaultLocalRepository;
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

      previousEncryptedCredentials =
        await this.vaultLocalRepository.getDeviceSyncCredentialState(
          params.vaultId,
        );

      if (previousEncryptedCredentials === null) {
        throw new LocalSyncCredentialsMissingError(params.vaultId);
      }

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
        syncState.remoteSnapshotDescriptor === undefined ||
        !areVaultSnapshotDescriptorsEqual(
          replacementRemoteDescriptor,
          syncState.remoteSnapshotDescriptor,
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

    const persistedSnapshot =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.persistUnlockedVault(
            params.vaultId,
            rotatedUnlockedVault,
            sourceSnapshotVersionVector,
            {
              vaultKeyGeneration,
              keySlots: { deviceSlots },
              nextTrust: {
                chain: nextTrust.chain,
                state: nextTrust.trust,
              },
              ...(encryptedCredentialState === undefined
                ? {}
                : { syncCredentialState: encryptedCredentialState }),
            },
          ),
      );

    try {
      if (
        replacementAccess !== undefined &&
        syncState.remoteSnapshotDescriptor !== undefined
      ) {
        await this.syncProvider.uploadVaultSnapshot(
          replacementAccess,
          persistedSnapshot.snapshot,
          syncState.remoteSnapshotDescriptor,
        );
      }
    } catch (error) {
      await this.unlockedVaultSession.restorePersistedState(
        sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.restoreLocalVaultSnapshot(
            currentSnapshot,
            persistedSnapshot.snapshot,
            unlockedVault,
            previousEncryptedCredentials,
          ),
      );

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }

    await this.unlockedVaultSession.commitPersistedSnapshot(
      sessionId,
      {
        ...rotatedUnlockedVault,
        trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
      },
      persistedSnapshot.snapshotVersionVector,
    );

    return {
      vault: toVisibleVaultFields(revokedVault),
      snapshotVersionVector: {
        ...persistedSnapshot.snapshotVersionVector,
      },
      revisionTimestamp: persistedSnapshot.revisionTimestamp,
      providerCredentialRevocation:
        replacementAccess === undefined
          ? "not_configured"
          : "pending_external_disable",
    };
  }
}
