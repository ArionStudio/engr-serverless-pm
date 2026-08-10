import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { VaultLifecycleCleanupService } from "../../services/session/vault-lifecycle-cleanup.service";

export type LockVaultCommandParams = {
  actionId?: string;
};

export class LockVaultUseCase {
  private readonly lifecycleCleanup: VaultLifecycleCleanupService;

  constructor(
    clipboardClear: ClipboardClearService,
    clipboardClearTasks: ClipboardClearTaskRepositoryPort,
    scheduledTasks: ScheduledTaskPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
  ) {
    this.lifecycleCleanup = new VaultLifecycleCleanupService(
      clipboardClear,
      clipboardClearTasks,
      scheduledTasks,
      vaultLockTasks,
      unlockedVaultSession,
    );
  }

  async execute(params: LockVaultCommandParams = {}): Promise<void> {
    await this.lifecycleCleanup.cleanup(params);
  }
}
