import type { ScheduledTaskPort } from "../../ports/scheduled-task.port";
import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault-lock-task-repository.port";

export type LockVaultCommandParams = {
  actionId?: string;
};

export class LockVaultUseCase {
  private readonly scheduledTasks: ScheduledTaskPort;
  private readonly vaultLockTasks: VaultLockTaskRepositoryPort;
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(
    scheduledTasks: ScheduledTaskPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
  ) {
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

    try {
      if (vaultLockTask !== null) {
        await this.scheduledTasks.cancelTask({
          name: "lockVault",
          actionId: vaultLockTask.actionId,
        });
        await this.vaultLockTasks.remove();
      }
    } finally {
      await this.unlockedVaultRepository.removeUnlockedVault();
    }
  }
}
