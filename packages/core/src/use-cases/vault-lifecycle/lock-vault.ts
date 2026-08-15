import type { VaultLifecycleCleanupService } from "../../services/session/vault-lifecycle-cleanup.service";

export type LockVaultCommandParams = {
  actionId?: string;
};

export class LockVaultUseCase {
  private readonly lifecycleCleanup: VaultLifecycleCleanupService;

  constructor(lifecycleCleanup: VaultLifecycleCleanupService) {
    this.lifecycleCleanup = lifecycleCleanup;
  }

  async execute(params: LockVaultCommandParams = {}): Promise<void> {
    await this.lifecycleCleanup.cleanup(params);
  }
}
