import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
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
import type { ClockPort } from "../../ports/system/clock.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";

export type DisableSyncCommandParams = {
  readonly vaultId: string;
};

export class DisableSyncUseCase {
  private readonly clock: ClockPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    clock: ClockPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.clock = clock;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
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

    await this.syncProvider.removeVaultSnapshots(syncConfig, params.vaultId);

    const currentDeviceSlots = localSnapshot.keySlots.deviceSlots.filter(
      (deviceSlot) => deviceSlot.deviceId === unlockedVault.deviceId,
    );
    const persistedSnapshot = await this.vaultSnapshot.persistUnlockedVault(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotVersionVector,
      {
        keySlots: {
          deviceSlots: currentDeviceSlots,
          recoveryKeySlot: localSnapshot.keySlots.recoveryKeySlot,
          completedEnrollments: localSnapshot.keySlots.completedEnrollments,
        },
      },
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      persistedSnapshot.snapshotVersionVector,
    );
  }
}
