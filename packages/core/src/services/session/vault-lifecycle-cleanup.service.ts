import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ClipboardOperationCoordinatorPort } from "../../ports/clipboard/clipboard-operation-coordinator.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { ClipboardClearService } from "../clipboard/clipboard-clear.service";
import type { UnlockedVaultSessionService } from "./unlocked-vault-session.service";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { ClipboardOperationLease } from "../../ports/clipboard/clipboard-operation-coordinator.port";

export type VaultLifecycleCleanupParams = {
  readonly actionId?: string;
  readonly afterSessionRemoval?: () => Promise<void>;
  readonly requiredVaultId?: string;
};

type SessionDiscardResult =
  | "discarded"
  | "session_advanced"
  | "session_replaced"
  | "session_unavailable"
  | "rollback_failed";

export class VaultLifecycleCleanupService {
  private readonly clipboardClear: ClipboardClearService;
  private readonly clipboardClearTasks: ClipboardClearTaskRepositoryPort;
  private readonly clipboardOperations: ClipboardOperationCoordinatorPort;
  private readonly scheduledTasks: ScheduledTaskPort;
  private readonly vaultLockTasks: VaultLockTaskRepositoryPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;

  constructor(
    clipboardClear: ClipboardClearService,
    clipboardClearTasks: ClipboardClearTaskRepositoryPort,
    clipboardOperations: ClipboardOperationCoordinatorPort,
    scheduledTasks: ScheduledTaskPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
  ) {
    this.clipboardClear = clipboardClear;
    this.clipboardClearTasks = clipboardClearTasks;
    this.clipboardOperations = clipboardOperations;
    this.scheduledTasks = scheduledTasks;
    this.vaultLockTasks = vaultLockTasks;
    this.unlockedVaultSession = unlockedVaultSession;
  }

  async cleanup(
    params: VaultLifecycleCleanupParams = {},
  ): Promise<"cleaned" | "session_unavailable" | "stale_action"> {
    return this.clipboardOperations.runExclusive((coordinationLease) =>
      this.cleanupExclusive(params, coordinationLease),
    );
  }

  private async cleanupExclusive(
    params: VaultLifecycleCleanupParams,
    coordinationLease: ClipboardOperationLease,
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
      params.afterSessionRemoval,
      coordinationLease,
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
  ): Promise<SessionDiscardResult> {
    let operationStarted = false;

    try {
      return await this.clipboardOperations.runExclusive(
        (coordinationLease) => {
          operationStarted = true;
          return this.discardExclusive(params, discard, coordinationLease);
        },
      );
    } catch (error) {
      if (operationStarted) {
        throw error;
      }

      return "rollback_failed";
    }
  }

  private async discardExclusive(
    params: {
      readonly sessionId: string;
      readonly vaultId: string;
      readonly generation: number;
      readonly sourceSnapshotVersionVector: VersionVector;
    },
    discard: () => Promise<boolean>,
    coordinationLease: ClipboardOperationLease,
  ): Promise<SessionDiscardResult> {
    return this.unlockedVaultSession.discardIfSessionIsActive(
      params.sessionId,
      params.vaultId,
      params.generation,
      params.sourceSnapshotVersionVector,
      async () => {
        await this.cleanupTasks(undefined, params.vaultId);
      },
      discard,
      coordinationLease,
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
    let scheduledActionAuthenticationFailed = false;

    try {
      vaultLockTask = await this.vaultLockTasks.get();
    } catch (error) {
      firstError ??= error;
      vaultLockTask = null;

      if (actionId !== undefined) {
        try {
          lockMetadataRemoved =
            await this.vaultLockTasks.removeIfActionIsActive(actionId);
        } catch {
          scheduledActionAuthenticationFailed = true;
        }

        if (!lockMetadataRemoved && !scheduledActionAuthenticationFailed) {
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
      !lockMetadataRemoved &&
      !scheduledActionAuthenticationFailed
    ) {
      return { status: "stale_action" };
    }

    let clipboardClearTask: Awaited<
      ReturnType<ClipboardClearTaskRepositoryPort["get"]>
    >;
    try {
      clipboardClearTask = await this.clipboardClearTasks.get();
    } catch (error) {
      firstError ??= error;
      clipboardClearTask = null;
    }

    if (clipboardClearTask !== null) {
      let clipboardOwnershipReleased = false;

      try {
        await this.clipboardClear.clearTask({
          task: clipboardClearTask,
          requireExpired: false,
        });
        clipboardOwnershipReleased = true;
      } catch (error) {
        firstError ??= error;
      }

      if (clipboardOwnershipReleased) {
        try {
          await this.scheduledTasks.cancelTask({
            name: "clearClipboard",
            actionId: clipboardClearTask.actionId,
          });
        } catch (error) {
          firstError ??= error;
        }
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

    if (actionId !== undefined && lockMetadataRemoved) {
      try {
        if ((await this.vaultLockTasks.get()) !== null) {
          return {
            status: "stale_action",
            ...(firstError === undefined ? {} : { error: firstError }),
          };
        }
      } catch (error) {
        firstError ??= error;
        scheduledActionAuthenticationFailed = true;
      }
    }

    if (vaultLockTask !== null && !lockMetadataRemoved) {
      try {
        const removed = await this.vaultLockTasks.removeIfActionIsActive(
          vaultLockTask.actionId,
        );

        if (actionId !== undefined && !removed) {
          return {
            status: "stale_action",
            ...(firstError === undefined ? {} : { error: firstError }),
          };
        }
      } catch (error) {
        firstError ??= error;

        if (actionId !== undefined) {
          scheduledActionAuthenticationFailed = true;
        }
      }
    }

    if (scheduledActionAuthenticationFailed) {
      return {
        status: "stale_action",
        ...(firstError === undefined ? {} : { error: firstError }),
      };
    }

    if (firstError !== undefined) {
      throw firstError;
    }

    return { status: "cleaned" };
  }
}
