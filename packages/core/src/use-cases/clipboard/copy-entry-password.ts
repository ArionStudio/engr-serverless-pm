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

import { SecretClipboardCopyService } from "../../services/clipboard/secret-clipboard-copy.service";

export type CopyEntryPasswordCommandParams = {
  vaultId: string;
  entryId: string;
  clearAfterMs: ClipboardClearDelayMs;
};

export type CopyEntryPasswordResult = {
  copied: true;
};

export class CopyEntryPasswordUseCase {
  private readonly secretCopy: SecretClipboardCopyService;
  private readonly clipboardOperations: ClipboardOperationCoordinatorPort;
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
    this.clipboardOperations = clipboardOperations;
    this.secretCopy = new SecretClipboardCopyService(
      clipboard,
      clipboardClear,
      clipboardSecretHash,
      ids,
      clipboardClearTasks,
      scheduledTasks,
      clock,
    );
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

    return this.clipboardOperations.runExclusive((coordinationLease) =>
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

          await this.secretCopy.copy(entry.password, params.clearAfterMs);

          return {
            copied: true,
          };
        },
        coordinationLease,
      ),
    );
  }
}
