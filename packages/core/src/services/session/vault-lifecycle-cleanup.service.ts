import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { ClipboardClearService } from "../clipboard/clipboard-clear.service";
import type { UnlockedVaultSessionService } from "./unlocked-vault-session.service";
import type { VersionVector } from "../../domain/versioning/version-vector.type";

export type VaultLifecycleCleanupParams = {
  readonly actionId?: string;
  readonly requiredVaultId?: string;
};

export class VaultLifecycleCleanupService {
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

  async cleanup(
    params: VaultLifecycleCleanupParams = {},
  ): Promise<"cleaned" | "session_unavailable" | "stale_action"> {
    let staleAction = false;
    let staleActionError: unknown;
    const result = await this.unlockedVaultSession.cleanupActiveSession(
      params.requiredVaultId,
      params.actionId === undefined,
      async (activeSession) => {
        const taskCleanup = await this.cleanupTasks(
          params.actionId,
          activeSession?.vaultId ?? params.requiredVaultId,
        );
        if (taskCleanup.status === "stale_action") {
          staleAction = true;
          staleActionError = taskCleanup.error;
        }
        return !staleAction;
      },
    );

    if (staleActionError !== undefined) {
      throw staleActionError;
    }

    if (staleAction || result === "stale_action") {
      return "stale_action";
    }

    return result === "session_unavailable" ? result : "cleaned";
  }

  async discardIfSessionIsActive(
    params: {
      readonly sessionId: string;
      readonly vaultId: string;
      readonly generation: number;
      readonly sourceSnapshotVersionVector: VersionVector;
    },
    discard: () => Promise<boolean>,
  ): Promise<
    | "discarded"
    | "session_advanced"
    | "session_replaced"
    | "session_unavailable"
    | "rollback_failed"
  > {
    return this.unlockedVaultSession.discardIfSessionIsActive(
      params.sessionId,
      params.vaultId,
      params.generation,
      params.sourceSnapshotVersionVector,
      async () => {
        await this.cleanupTasks(undefined, params.vaultId);
      },
      discard,
    );
  }

  private async cleanupTasks(
    actionId: string | undefined,
    expectedVaultId: string | undefined,
  ): Promise<
    | { readonly status: "cleaned" }
    | { readonly status: "stale_action"; readonly error?: unknown }
  > {
    let firstError: unknown;
    let vaultLockTask: Awaited<ReturnType<VaultLockTaskRepositoryPort["get"]>>;
    let lockMetadataRemoved = false;

    try {
      vaultLockTask = await this.vaultLockTasks.get();
    } catch (error) {
      firstError = error;
      vaultLockTask = null;

      if (actionId !== undefined) {
        try {
          lockMetadataRemoved =
            await this.vaultLockTasks.removeIfActionIsActive(actionId);
        } catch {
          return { status: "stale_action", error };
        }

        if (!lockMetadataRemoved) {
          return { status: "stale_action" };
        }
      }
    }

    if (
      actionId !== undefined &&
      vaultLockTask !== null &&
      (vaultLockTask.actionId !== actionId ||
        (expectedVaultId !== undefined &&
          vaultLockTask.vaultId !== expectedVaultId))
    ) {
      return { status: "stale_action" };
    }

    if (
      actionId !== undefined &&
      vaultLockTask === null &&
      !lockMetadataRemoved
    ) {
      return { status: "stale_action" };
    }

    let clipboardClearTask: Awaited<
      ReturnType<ClipboardClearTaskRepositoryPort["get"]>
    >;
    let clipboardTaskReadFailed = false;

    try {
      clipboardClearTask = await this.clipboardClearTasks.get();
    } catch (error) {
      firstError ??= error;
      clipboardClearTask = null;
      clipboardTaskReadFailed = true;
    }

    if (clipboardClearTask !== null) {
      try {
        await this.clipboardClear.clearTask({
          task: clipboardClearTask,
          requireExpired: false,
        });
      } catch (error) {
        firstError ??= error;
        clipboardTaskReadFailed = true;
      }

      try {
        await this.scheduledTasks.cancelTask({
          name: "clearClipboard",
          actionId: clipboardClearTask.actionId,
        });
      } catch (error) {
        firstError ??= error;
      }
    }

    if (clipboardTaskReadFailed) {
      try {
        await this.clipboardClearTasks.remove();
      } catch (error) {
        firstError ??= error;
      }
    }

    const lockActionId = vaultLockTask?.actionId ?? actionId;

    if (lockActionId !== undefined) {
      try {
        await this.scheduledTasks.cancelTask({
          name: "lockVault",
          actionId: lockActionId,
        });
      } catch (error) {
        firstError ??= error;
      }
    }

    if (vaultLockTask !== null && !lockMetadataRemoved) {
      try {
        await this.vaultLockTasks.removeIfActionIsActive(
          vaultLockTask.actionId,
        );
      } catch (error) {
        firstError ??= error;
      }
    }

    if (firstError !== undefined) {
      throw firstError;
    }

    return { status: "cleaned" };
  }
}
