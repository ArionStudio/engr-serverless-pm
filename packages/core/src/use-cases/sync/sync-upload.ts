import { requireVaultSyncConfig } from "../../services/sync/sync-config.utils";
import type { VaultSyncUploadService } from "../../services/sync/vault-sync-upload.service";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/vault-snapshots/vault-snapshot.service";

export type SyncUploadCommandParams = {
  readonly vaultId: string;
};

export class SyncUploadUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultSyncUpload: VaultSyncUploadService;

  constructor(
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultSyncUpload: VaultSyncUploadService,
  ) {
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultSyncUpload = vaultSyncUpload;
  }

  async execute(params: SyncUploadCommandParams): Promise<void> {
    const { unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "sync upload",
      );
    const syncConfig = requireVaultSyncConfig(
      params.vaultId,
      "sync upload",
      unlockedVault.vault,
    );

    const localSnapshot = await this.vaultSnapshot.requireLocalVaultSnapshot(
      params.vaultId,
    );

    await this.vaultSyncUpload.uploadLocalSnapshotWhenSafe({
      vaultId: params.vaultId,
      syncConfig,
      localVault: unlockedVault.vault,
      localSnapshot,
    });
  }
}
