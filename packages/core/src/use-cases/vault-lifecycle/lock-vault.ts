import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";

export type LockVaultCommandParams = {
  actionId?: string;
};

export class LockVaultUseCase {
  private readonly clipboardClear: ClipboardClearService;
  private readonly clipboardClearTasks: ClipboardClearTaskRepositoryPort;
  private readonly scheduledTasks: ScheduledTaskPort;
  private readonly vaultLockTasks: VaultLockTaskRepositoryPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;

  constructor(
    clipboardClear: ClipboardClearService,
    clipboardClearTasks: ClipboardClearTaskRepositoryPort,
    scheduledTasks: ScheduledTaskPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
  ) {
    this.clipboardClear = clipboardClear;
    this.clipboardClearTasks = clipboardClearTasks;
    this.scheduledTasks = scheduledTasks;
    this.vaultLockTasks = vaultLockTasks;
    this.unlockedVaultSession = unlockedVaultSession;
  }

  async execute(params: LockVaultCommandParams = {}): Promise<void> {
    const vaultLockTask = await this.vaultLockTasks.get();

    if (
      params.actionId !== undefined &&
      vaultLockTask !== null &&
      vaultLockTask.actionId !== params.actionId
    ) {
      return;
    }

    const clipboardClearTask = await this.clipboardClearTasks.get();

    let executionError: unknown;
    let sessionRemovalError: unknown;

    try {
      let cleanupError: unknown;

      try {
        await this.clipboardClear.clearTask({
          task: clipboardClearTask,
          requireExpired: false,
        });

        if (clipboardClearTask !== null) {
          await this.scheduledTasks.cancelTask({
            name: "clearClipboard",
            actionId: clipboardClearTask.actionId,
          });
        }
      } catch (error) {
        cleanupError = error;
      }

      if (vaultLockTask !== null) {
        try {
          await this.scheduledTasks.cancelTask({
            name: "lockVault",
            actionId: vaultLockTask.actionId,
          });
        } finally {
          await this.vaultLockTasks.remove();
        }
      }

      if (cleanupError !== undefined) {
        throw cleanupError;
      }
    } catch (error) {
      executionError = error;
    } finally {
      try {
        await this.unlockedVaultSession.remove();
      } catch (error) {
        if (executionError === undefined) {
          sessionRemovalError = error;
        }
      }
    }

    if (executionError !== undefined) {
      throw executionError;
    }

    if (sessionRemovalError !== undefined) {
      throw sessionRemovalError;
    }
  }
}
