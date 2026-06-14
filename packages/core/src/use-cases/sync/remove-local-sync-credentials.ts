import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { removeVaultSyncConfig } from "../../domain/vault/vault-sync-config.mutations";
import { SyncNotConfiguredError } from "../../errors/sync.errors";

export type RemoveLocalSyncCredentialsCommandParams = {
  readonly vaultId: string;
};

export class RemoveLocalSyncCredentialsUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(
    params: RemoveLocalSyncCredentialsCommandParams,
  ): Promise<void> {
    const { sourceSnapshotRevision, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "remove local sync credentials",
      );
    if (unlockedVault.vault.syncConfig === undefined) {
      throw new SyncNotConfiguredError(
        params.vaultId,
        "remove local sync credentials",
      );
    }

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: removeVaultSyncConfig(unlockedVault.vault),
    };

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
