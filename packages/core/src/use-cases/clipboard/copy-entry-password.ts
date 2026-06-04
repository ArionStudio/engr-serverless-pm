import { clipboardClearDelayMsSchema } from "../../domain/scheduled-task/scheduled-task-delay.schema";
import type { ClipboardClearDelayMs } from "../../domain/scheduled-task/scheduled-task-delay.type";
import type { ClipboardPort } from "../../ports/clipboard/clipboard.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import { InvalidClipboardClearDelayError } from "../__errors/clipboard.errors";
import { PasswordEntryNotFoundError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { GetUnlockedVaultSessionUseCase } from "../vault-session/get-unlocked-vault-session";
import type { ClearClipboardTaskUseCase } from "./clear-clipboard-task";

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
  private readonly clearClipboardTask: ClearClipboardTaskUseCase;
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;
  private readonly clipboardClearTasks: ClipboardClearTaskRepositoryPort;
  private readonly scheduledTasks: ScheduledTaskPort;
  private readonly clock: ClockPort;
  private readonly getUnlockedVaultSession: GetUnlockedVaultSessionUseCase;

  constructor(
    clipboard: ClipboardPort,
    clearClipboardTask: ClearClipboardTaskUseCase,
    crypto: CryptoPort,
    ids: IdPort,
    clipboardClearTasks: ClipboardClearTaskRepositoryPort,
    scheduledTasks: ScheduledTaskPort,
    clock: ClockPort,
    getUnlockedVaultSession: GetUnlockedVaultSessionUseCase,
  ) {
    this.clipboard = clipboard;
    this.clearClipboardTask = clearClipboardTask;
    this.crypto = crypto;
    this.ids = ids;
    this.clipboardClearTasks = clipboardClearTasks;
    this.scheduledTasks = scheduledTasks;
    this.clock = clock;
    this.getUnlockedVaultSession = getUnlockedVaultSession;
  }

  async execute(
    params: CopyEntryPasswordCommandParams,
  ): Promise<CopyEntryPasswordResult> {
    assertValidClipboardClearDelay(params.clearAfterMs);

    const unlockedVaultSession = await this.getUnlockedVaultSession.execute();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "copy entry password");
    }

    const entry = unlockedVault.vault.entries.find(
      (candidate) => candidate.id === params.entryId,
    );

    if (entry === undefined) {
      throw new PasswordEntryNotFoundError(params.vaultId, params.entryId);
    }

    const clearScheduledAt = this.clock.now() + params.clearAfterMs;
    const previousClipboardClearTask = await this.clipboardClearTasks.get();

    if (previousClipboardClearTask !== null) {
      let previousClearError: unknown;

      try {
        await this.clearClipboardTask.execute({
          task: previousClipboardClearTask,
          requireExpired: false,
        });
      } catch (error) {
        previousClearError = error;
      }

      try {
        await this.scheduledTasks.cancelTask({
          name: "clearClipboard",
          actionId: previousClipboardClearTask.actionId,
        });
      } catch (error) {
        if (previousClearError === undefined) {
          throw error;
        }
      }

      if (previousClearError !== undefined) {
        throw previousClearError;
      }
    }

    const actionId = await this.ids.generateId();
    const copiedValueHash = await this.crypto.hashSecretValue(entry.password);

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
      await this.clipboardClearTasks.remove();
      throw error;
    }

    try {
      await this.clipboard.writeText(entry.password);
    } catch (error) {
      try {
        await this.scheduledTasks.cancelTask({
          name: "clearClipboard",
          actionId,
        });
      } catch {
        // Preserve the clipboard write failure; repository cleanup still needs to run.
      }
      try {
        await this.clipboardClearTasks.remove();
      } catch {
        // Preserve the clipboard write failure.
      }
      throw error;
    }

    return {
      copied: true,
    };
  }
}

function assertValidClipboardClearDelay(clearAfterMs: number): void {
  const clearDelayResult = clipboardClearDelayMsSchema.safeParse(clearAfterMs);

  if (!clearDelayResult.success) {
    throw new InvalidClipboardClearDelayError(clearDelayResult.error);
  }
}
