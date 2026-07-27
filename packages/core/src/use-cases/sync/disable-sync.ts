import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import {
  areVaultSnapshotDescriptorsEqual,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import { removeVaultSyncConfig } from "../../domain/vault/vault-sync-config.mutations";
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
    const { sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "disable sync",
      );
    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "disable sync");
    }

    const revisionTimestamp = this.clock.now();
    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: removeVaultSyncConfig(
        removeOtherDeviceProfilesFromVault(
          unlockedVault.vault,
          unlockedVault.deviceId,
          revisionTimestamp,
        ),
      ),
    };

    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        updatedUnlockedVault,
        sourceSnapshotVersionVector,
      );
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncConfig,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor !== null) {
      const localSnapshotDescriptor = toVaultSnapshotDescriptor(
        params.vaultId,
        localSnapshot,
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

    const currentDeviceSlots = localSnapshot.keySlots.deviceSlots.filter(
      (deviceSlot) => deviceSlot.deviceId === unlockedVault.deviceId,
    );
    const trustChain = localSnapshot.trustChain;

    if (trustChain === undefined) {
      throw new VaultTrustStateInvalidError(
        params.vaultId,
        "trust chain is missing",
      );
    }

    const nextTrust = await this.vaultTrust.appendTrustTransition(
      params.vaultId,
      trustChain,
      unlockedVault.trustedSnapshotContext.trust,
      unlockedVault.trustedSnapshotContext.trust.trustedDevices.filter(
        (device) => device.deviceId === unlockedVault.deviceId,
      ),
      unlockedVault.deviceId,
      unlockedVault.devicePrivateSignKey,
    );

    const persistedSnapshot = await this.vaultSnapshot.persistUnlockedVault(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotVersionVector,
      {
        keySlots: {
          deviceSlots: currentDeviceSlots,
          completedEnrollments: localSnapshot.keySlots.completedEnrollments,
        },
        nextTrust: {
          chain: nextTrust.chain,
          state: nextTrust.trust,
        },
      },
    );

    await this.syncProvider.removeVaultSnapshots(syncConfig, params.vaultId);

    await this.unlockedVaultSession.commitPersistedSnapshot(
      {
        ...updatedUnlockedVault,
        trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
      },
      persistedSnapshot.snapshotVersionVector,
    );
  }
}
