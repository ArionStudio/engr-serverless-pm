import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/vault-snapshots/vault-snapshot.service";
import { removeVaultSyncConfig } from "../../domain/vault/vault-sync-config.mutations";
import { requireVaultSyncConfig } from "./require-vault-sync-config";

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
    requireVaultSyncConfig(
      params.vaultId,
      "remove local sync credentials",
      unlockedVault.vault,
    );

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
