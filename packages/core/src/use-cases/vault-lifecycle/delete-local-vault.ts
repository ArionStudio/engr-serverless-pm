import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { VaultMustBeUnlockedForLocalDeletionError } from "../../errors/delete-local-vault.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";
import { VaultLifecycleCleanupService } from "../../services/session/vault-lifecycle-cleanup.service";

export type DeleteLocalVaultCommandParams = {
  vaultId: string;
};

export class DeleteLocalVaultUseCase {
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly lifecycleCleanup: VaultLifecycleCleanupService;

  constructor(
    vaultLocalRepository: VaultLocalRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    clipboardClear: ClipboardClearService,
    clipboardClearTasks: ClipboardClearTaskRepositoryPort,
    scheduledTasks: ScheduledTaskPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
  ) {
    this.vaultLocalRepository = vaultLocalRepository;
    this.lifecycleCleanup = new VaultLifecycleCleanupService(
      clipboardClear,
      clipboardClearTasks,
      scheduledTasks,
      vaultLockTasks,
      unlockedVaultSession,
    );
  }

  async execute(params: DeleteLocalVaultCommandParams): Promise<void> {
    const cleanupResult = await this.lifecycleCleanup.cleanup({
      requiredVaultId: params.vaultId,
    });

    if (cleanupResult === "session_unavailable") {
      throw new VaultMustBeUnlockedForLocalDeletionError(params.vaultId);
    }

    await this.vaultLocalRepository.removePersistedLocalVault(params.vaultId);
  }
}
