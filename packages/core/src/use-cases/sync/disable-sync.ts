import { SyncNotConfiguredError } from "../../application/errors/sync.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import type { UnlockedVaultSessionService } from "../../application/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../application/vault-snapshots/vault-snapshot.service";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";

export type DisableSyncCommandParams = {
  readonly vaultId: string;
};

export class DisableSyncUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(params: DisableSyncCommandParams): Promise<void> {
    const unlockedVaultSession = await this.unlockedVaultSession.get();

    if (
      unlockedVaultSession === null ||
      unlockedVaultSession.unlockedVault.vaultId !== params.vaultId
    ) {
      throw new VaultMustBeUnlockedError(params.vaultId, "disable sync");
    }

    const { sourceSnapshotRevision, unlockedVault } = unlockedVaultSession;

    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "disable sync");
    }

    const updatedVault = {
      ...unlockedVault.vault,
    };

    delete updatedVault.syncConfig;

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: updatedVault,
    };

    await this.vaultSnapshot.assertCanPersistUnlockedVault(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotRevision,
    );

    await this.syncProvider.removeVaultSnapshots(syncConfig, params.vaultId);

    const persistedSnapshot = await this.vaultSnapshot.persistUnlockedVault(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotRevision,
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      persistedSnapshot.revision,
    );
  }
}
