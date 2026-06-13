import { SyncNotConfiguredError } from "../../application/errors/sync.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import type { UnlockedVaultSessionService } from "../../application/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../application/vault-snapshots/vault-snapshot.service";

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
    const unlockedVaultSession = await this.unlockedVaultSession.get();

    if (
      unlockedVaultSession === null ||
      unlockedVaultSession.unlockedVault.vaultId !== params.vaultId
    ) {
      throw new VaultMustBeUnlockedError(
        params.vaultId,
        "remove local sync credentials",
      );
    }

    const { sourceSnapshotRevision, unlockedVault } = unlockedVaultSession;

    if (unlockedVault.vault.syncConfig === undefined) {
      throw new SyncNotConfiguredError(
        params.vaultId,
        "remove local sync credentials",
      );
    }

    const updatedVault = {
      ...unlockedVault.vault,
    };

    delete updatedVault.syncConfig;

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: updatedVault,
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
