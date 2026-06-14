import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { removeVaultSyncConfig } from "../../domain/vault/vault-sync-config.mutations";
import { SyncNotConfiguredError } from "../../errors/sync.errors";
import type { VaultSyncGuardService } from "../../services/sync";

export type RemoveLocalSyncCredentialsCommandParams = {
  readonly vaultId: string;
};

export class RemoveLocalSyncCredentialsUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(
    params: RemoveLocalSyncCredentialsCommandParams,
  ): Promise<void> {
    const { sourceSnapshotVersionVector, unlockedVault } =
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

    await this.vaultSyncGuard.requireReadyForLocalMutation(
      params.vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: removeVaultSyncConfig(unlockedVault.vault),
    };

    const persistedSnapshot = await this.vaultSnapshot.persistUnlockedVault(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotVersionVector,
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      persistedSnapshot.snapshotVersionVector,
    );
  }
}
