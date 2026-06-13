import type {
  VaultSyncReviewPreparation,
  VaultSyncReviewService,
} from "../../services/sync/vault-sync-review.service";
import { requireVaultSyncConfig } from "../../services/sync/sync-config.utils";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";

export type PrepareSyncReviewCommandParams = {
  readonly vaultId: string;
};

export type PrepareSyncReviewResult = VaultSyncReviewPreparation;

export class PrepareSyncReviewUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncReview: VaultSyncReviewService;

  constructor(
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncReview: VaultSyncReviewService,
  ) {
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncReview = vaultSyncReview;
  }

  async execute(
    params: PrepareSyncReviewCommandParams,
  ): Promise<PrepareSyncReviewResult> {
    const { unlockedVault } =
      await this.unlockedVaultSession.getUnlockedVaultContext(
        params.vaultId,
        "prepare sync review",
      );
    const syncConfig = requireVaultSyncConfig(
      params.vaultId,
      "prepare sync review",
      unlockedVault.vault,
    );

    return this.vaultSyncReview.prepareReview({
      vaultId: params.vaultId,
      syncConfig,
      localVault: unlockedVault.vault,
      vaultMasterKey: unlockedVault.vaultMasterKey,
    });
  }
}
