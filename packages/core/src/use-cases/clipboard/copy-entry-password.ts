import { clipboardClearDelayMsSchema } from "../../domain/scheduled-task/scheduled-task-delay.schema";
import type { ClipboardClearDelayMs } from "../../domain/scheduled-task/scheduled-task-delay.type";
import type { ClipboardPort } from "../../ports/clipboard/clipboard.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { IdPort } from "../../ports/system/id.port";
import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ClipboardOperationCoordinatorPort } from "../../ports/clipboard/clipboard-operation-coordinator.port";
import type { ClipboardSecretHashPort } from "../../ports/clipboard/clipboard-secret-hash.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import { InvalidClipboardClearDelayError } from "../../errors/clipboard.errors";
import { PasswordEntryNotFoundError } from "../../errors/vault-entry.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";

export type CopyEntryPasswordCommandParams = {
  vaultId: string;
  entryId: string;
  clearAfterMs: ClipboardClearDelayMs;
};

export type CopyEntryPasswordResult = {
  copied: true;
};

export class CopyEntryPasswordUseCase {
  private readonly clipboard: ClipboardPort;
  private readonly clipboardClear: ClipboardClearService;
  private readonly clipboardOperations: ClipboardOperationCoordinatorPort;
  private readonly clipboardSecretHash: ClipboardSecretHashPort;
  private readonly ids: IdPort;
  private readonly clipboardClearTasks: ClipboardClearTaskRepositoryPort;
  private readonly scheduledTasks: ScheduledTaskPort;
  private readonly clock: ClockPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;

  constructor(
    clipboard: ClipboardPort,
    clipboardClear: ClipboardClearService,
    clipboardOperations: ClipboardOperationCoordinatorPort,
    clipboardSecretHash: ClipboardSecretHashPort,
    ids: IdPort,
    clipboardClearTasks: ClipboardClearTaskRepositoryPort,
    scheduledTasks: ScheduledTaskPort,
    clock: ClockPort,
    unlockedVaultSession: UnlockedVaultSessionService,
  ) {
    this.clipboard = clipboard;
    this.clipboardClear = clipboardClear;
    this.clipboardOperations = clipboardOperations;
    this.clipboardSecretHash = clipboardSecretHash;
    this.ids = ids;
    this.clipboardClearTasks = clipboardClearTasks;
    this.scheduledTasks = scheduledTasks;
    this.clock = clock;
    this.unlockedVaultSession = unlockedVaultSession;
  }

  async execute(
    params: CopyEntryPasswordCommandParams,
  ): Promise<CopyEntryPasswordResult> {
    const clearDelayResult = clipboardClearDelayMsSchema.safeParse(
      params.clearAfterMs,
    );

    if (!clearDelayResult.success) {
      throw new InvalidClipboardClearDelayError(clearDelayResult.error);
    }

    return this.clipboardOperations.runExclusive(() =>
      this.unlockedVaultSession.runWithUnlockedVaultContext(
        params.vaultId,
        "copy entry password",
        async ({ unlockedVault }) => {
          const entry = unlockedVault.vault.entries.find(
            (candidate) => candidate.id === params.entryId,
          );

          if (entry === undefined) {
            throw new PasswordEntryNotFoundError(
              params.vaultId,
              params.entryId,
            );
          }

          const clearScheduledAt = this.clock.now() + params.clearAfterMs;
          const previousClipboardClearTask =
            await this.clipboardClearTasks.get();

          if (previousClipboardClearTask !== null) {
            await this.clipboardClear.clearTask({
              task: previousClipboardClearTask,
              requireExpired: false,
            });
            await this.scheduledTasks.cancelTask({
              name: "clearClipboard",
              actionId: previousClipboardClearTask.actionId,
            });
          }

          const actionId = await this.ids.generateId();
          const copiedValueHash =
            await this.clipboardSecretHash.hashSecretValue(entry.password);

          await this.clipboardClearTasks.save({
            actionId,
            copiedValueHash,
            expiresAt: clearScheduledAt,
          });

          try {
            await this.scheduledTasks.scheduleTask({
              task: {
                name: "clearClipboard",
                actionId,
              },
              runAt: clearScheduledAt,
            });
          } catch (error) {
            try {
              await this.clipboardClearTasks.remove();
            } catch {
              // Preserve the schedule failure as the root cause.
            }

            throw error;
          }

          // The OS write may commit before the adapter observes a response
          // failure. Retain ownership so the alarm can clear a committed value
          // or discard metadata after a hash mismatch.
          await this.clipboard.writeText(entry.password);

          return {
            copied: true,
          };
        },
      ),
    );
  }
}
