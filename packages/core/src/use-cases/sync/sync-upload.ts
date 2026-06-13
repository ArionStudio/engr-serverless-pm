import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { VaultSnapshotNotFoundError } from "../../errors/unlock-vault.errors";
import { requireVaultSyncConfig } from "../../services/sync/sync-config.utils";
import type { VaultSyncUploadService } from "../../services/sync/vault-sync-upload.service";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";

export type SyncUploadCommandParams = {
  readonly vaultId: string;
};

export class SyncUploadUseCase {
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncUpload: VaultSyncUploadService;

  constructor(
    vaultLocalRepository: VaultLocalRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncUpload: VaultSyncUploadService,
  ) {
    this.vaultLocalRepository = vaultLocalRepository;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncUpload = vaultSyncUpload;
  }

  async execute(params: SyncUploadCommandParams): Promise<void> {
    const { unlockedVault } =
      await this.unlockedVaultSession.getUnlockedVaultContext(
        params.vaultId,
        "sync upload",
      );
    const syncConfig = requireVaultSyncConfig(
      params.vaultId,
      "sync upload",
      unlockedVault.vault,
    );

    const localSnapshot = await this.vaultLocalRepository.getVaultSnapshot(
      params.vaultId,
    );

    if (localSnapshot === null) {
      throw new VaultSnapshotNotFoundError(params.vaultId);
    }

    await this.vaultSyncUpload.uploadLocalSnapshotIfAllowed({
      vaultId: params.vaultId,
      syncConfig,
      localVault: unlockedVault.vault,
      localSnapshot,
    });
  }
}
