import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import { vaultLockDelayMsSchema } from "../../domain/scheduled-task/scheduled-task-delay.schema";
import type { VaultLockDelayMs } from "../../domain/scheduled-task/scheduled-task-delay.type";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import { InvalidVaultLockDelayError } from "../../errors/vault-session.errors";
import type { ClockPort } from "../../ports/system/clock.port";
import type { IdPort } from "../../ports/system/id.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { UnlockedVaultSessionService } from "./unlocked-vault-session.service";

export class VaultSessionActivationService {
  private readonly clock: ClockPort;
  private readonly ids: IdPort;
  private readonly scheduledTasks: ScheduledTaskPort;
  private readonly vaultLockTasks: VaultLockTaskRepositoryPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;

  constructor(
    clock: ClockPort,
    ids: IdPort,
    scheduledTasks: ScheduledTaskPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
  ) {
    this.clock = clock;
    this.ids = ids;
    this.scheduledTasks = scheduledTasks;
    this.vaultLockTasks = vaultLockTasks;
    this.unlockedVaultSession = unlockedVaultSession;
  }

  requireValidLockDelay(lockAfterMs: VaultLockDelayMs): VaultLockDelayMs {
    const result = vaultLockDelayMsSchema.safeParse(lockAfterMs);

    if (!result.success) {
      throw new InvalidVaultLockDelayError(result.error);
    }

    return result.data;
  }

  async activate(params: {
    readonly activationGeneration: number;
    readonly unlockedVault: UnlockedVault;
    readonly sourceSnapshotVersionVector: VersionVector;
    readonly lockAfterMs: VaultLockDelayMs;
  }): Promise<{ readonly sessionId: string; readonly generation: number }> {
    let actionId: string | undefined;

    return this.unlockedVaultSession.activateWithAutoLock(
      params.activationGeneration,
      params.unlockedVault,
      params.sourceSnapshotVersionVector,
      async () => {
        actionId = await this.ids.generateId();
        const expiresAt = this.clock.now() + params.lockAfterMs;

        try {
          await this.vaultLockTasks.save({
            actionId,
            vaultId: params.unlockedVault.vaultId,
            expiresAt,
          });
          await this.scheduledTasks.scheduleTask({
            task: {
              name: "lockVault",
              actionId,
            },
            runAt: expiresAt,
          });
        } catch (error) {
          try {
            await this.scheduledTasks.cancelTask({
              name: "lockVault",
              actionId,
            });
          } catch {
            // Matching metadata cleanup still must run.
          }

          try {
            await this.vaultLockTasks.removeIfActionIsActive(actionId);
          } catch {
            // The scheduling failure remains the root cause.
          }
          throw error;
        }
      },
      async () => {
        if (actionId === undefined) {
          return;
        }

        try {
          await this.scheduledTasks.cancelTask({
            name: "lockVault",
            actionId,
          });
        } catch {
          // Metadata cleanup still must run.
        }

        try {
          await this.vaultLockTasks.removeIfActionIsActive(actionId);
        } catch {
          // Session activation remains the root cause.
        }
      },
    );
  }
}
