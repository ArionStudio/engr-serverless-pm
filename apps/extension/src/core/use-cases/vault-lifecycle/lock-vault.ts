import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard-clear-task-repository.port";
import type { ScheduledTaskPort } from "../../ports/scheduled-task.port";
import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault-lock-task-repository.port";
import type { ClearClipboardTaskUseCase } from "../clipboard/clear-clipboard-task";

export type LockVaultCommandParams = {
  actionId?: string;
};

export class LockVaultUseCase {
  private readonly clearClipboardTask: ClearClipboardTaskUseCase;
  private readonly clipboardClearTasks: ClipboardClearTaskRepositoryPort;
  private readonly scheduledTasks: ScheduledTaskPort;
  private readonly vaultLockTasks: VaultLockTaskRepositoryPort;
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(
    clearClipboardTask: ClearClipboardTaskUseCase,
    clipboardClearTasks: ClipboardClearTaskRepositoryPort,
    scheduledTasks: ScheduledTaskPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
  ) {
    this.clearClipboardTask = clearClipboardTask;
    this.clipboardClearTasks = clipboardClearTasks;
    this.scheduledTasks = scheduledTasks;
    this.vaultLockTasks = vaultLockTasks;
    this.unlockedVaultRepository = unlockedVaultRepository;
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
    } finally {
      await this.unlockedVaultRepository.removeUnlockedVault();
    }
  }
}
