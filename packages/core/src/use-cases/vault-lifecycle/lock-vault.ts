import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { ClearClipboardTaskUseCase } from "../clipboard/clear-clipboard-task";
import type { RemoveUnlockedVaultSessionService } from "../../application/vault-session/remove-unlocked-vault-session.service";

export type LockVaultCommandParams = {
  actionId?: string;
};

export class LockVaultUseCase {
  private readonly clearClipboardTask: ClearClipboardTaskUseCase;
  private readonly clipboardClearTasks: ClipboardClearTaskRepositoryPort;
  private readonly scheduledTasks: ScheduledTaskPort;
  private readonly vaultLockTasks: VaultLockTaskRepositoryPort;
  private readonly removeUnlockedVaultSession: RemoveUnlockedVaultSessionService;

  constructor(
    clearClipboardTask: ClearClipboardTaskUseCase,
    clipboardClearTasks: ClipboardClearTaskRepositoryPort,
    scheduledTasks: ScheduledTaskPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
    removeUnlockedVaultSession: RemoveUnlockedVaultSessionService,
  ) {
    this.clearClipboardTask = clearClipboardTask;
    this.clipboardClearTasks = clipboardClearTasks;
    this.scheduledTasks = scheduledTasks;
    this.vaultLockTasks = vaultLockTasks;
    this.removeUnlockedVaultSession = removeUnlockedVaultSession;
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

    try {
      let cleanupError: unknown;

      try {
        await this.clearClipboardTask.execute({
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
        await this.removeUnlockedVaultSession.remove();
      } catch (error) {
        if (executionError === undefined) {
          throw error;
        }
      }
    }

    if (executionError !== undefined) {
      throw executionError;
    }
  }
}
