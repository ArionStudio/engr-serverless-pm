import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import {
  areVaultSnapshotDescriptorsEqual,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import {
  markVaultSyncRemovalPending,
  removeVaultSyncConfig,
} from "../../domain/vault/vault-sync-config.mutations";
import { removeOtherDeviceProfilesFromVault } from "../../domain/vault/vault-device.mutations";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotIntegrityError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";

export type DisableSyncCommandParams = {
  readonly vaultId: string;
};

export class DisableSyncUseCase {
  private readonly clock: ClockPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.clock = clock;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async execute(params: DisableSyncCommandParams): Promise<void> {
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "disable sync",
      );
    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "disable sync");
    }

    let currentUnlockedVault = unlockedVault;
    let currentSnapshotVersionVector = sourceSnapshotVersionVector;
    let currentSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        currentUnlockedVault,
        currentSnapshotVersionVector,
      );

    if (currentUnlockedVault.vault.syncRemovalPending !== true) {
      const remoteSnapshotDescriptor =
        await this.syncProvider.getLatestVaultSnapshotDescriptor(
          syncConfig,
          params.vaultId,
        );

      if (remoteSnapshotDescriptor !== null) {
        const localSnapshotDescriptor = toVaultSnapshotDescriptor(
          params.vaultId,
          currentSnapshot,
        );
        const relation = compareVaultSnapshotDescriptors(
          localSnapshotDescriptor,
          remoteSnapshotDescriptor,
        );

        if (relation === "remote_ahead") {
          throw new RemoteVaultSnapshotAheadError(params.vaultId);
        }

        if (
          relation === "broken" ||
          (relation === "equal" &&
            !areVaultSnapshotDescriptorsEqual(
              remoteSnapshotDescriptor,
              localSnapshotDescriptor,
            ))
        ) {
          throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
        }
      }

      const pendingUnlockedVault = {
        ...unlockedVault,
        vault: markVaultSyncRemovalPending(unlockedVault.vault),
      };
      const pendingSnapshot =
        await this.unlockedVaultSession.persistForActiveSession(
          sessionId,
          params.vaultId,
          async () =>
            this.vaultSnapshot.persistUnlockedVault(
              params.vaultId,
              pendingUnlockedVault,
              sourceSnapshotVersionVector,
            ),
        );

      currentUnlockedVault = {
        ...pendingUnlockedVault,
        trustedSnapshotContext: pendingSnapshot.trustedSnapshotContext,
      };
      currentSnapshotVersionVector = pendingSnapshot.snapshotVersionVector;
      currentSnapshot = pendingSnapshot.snapshot;

      await this.unlockedVaultSession.commitPersistedSnapshot(
        sessionId,
        currentUnlockedVault,
        currentSnapshotVersionVector,
      );
    }

    await this.syncProvider.removeVaultSnapshots(syncConfig, params.vaultId);

    const revisionTimestamp = this.clock.now();
    const updatedUnlockedVault = {
      ...currentUnlockedVault,
      vault: removeVaultSyncConfig(
        removeOtherDeviceProfilesFromVault(
          currentUnlockedVault.vault,
          currentUnlockedVault.deviceId,
          revisionTimestamp,
        ),
      ),
    };
    const currentDeviceSlots = currentSnapshot.keySlots.deviceSlots.filter(
      (deviceSlot) => deviceSlot.deviceId === currentUnlockedVault.deviceId,
    );
    const trustChain = currentSnapshot.trustChain;

    if (trustChain === undefined) {
      throw new VaultTrustStateInvalidError(
        params.vaultId,
        "trust chain is missing",
      );
    }

    const nextTrust = await this.vaultTrust.appendTrustTransition(
      params.vaultId,
      trustChain,
      currentUnlockedVault.trustedSnapshotContext.trust,
      currentUnlockedVault.trustedSnapshotContext.trust.trustedDevices.filter(
        (device) => device.deviceId === currentUnlockedVault.deviceId,
      ),
      currentUnlockedVault.deviceId,
      currentUnlockedVault.devicePrivateSignKey,
    );

    const persistedSnapshot =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.persistUnlockedVault(
            params.vaultId,
            updatedUnlockedVault,
            currentSnapshotVersionVector,
            {
              keySlots: {
                deviceSlots: currentDeviceSlots,
                completedEnrollments:
                  currentSnapshot.keySlots.completedEnrollments,
              },
              nextTrust: {
                chain: nextTrust.chain,
                state: nextTrust.trust,
              },
            },
          ),
      );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      sessionId,
      {
        ...updatedUnlockedVault,
        trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
      },
      persistedSnapshot.snapshotVersionVector,
    );
  }
}
