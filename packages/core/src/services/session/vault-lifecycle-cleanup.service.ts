import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ClipboardOperationCoordinatorPort } from "../../ports/clipboard/clipboard-operation-coordinator.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type {
  VaultLockTask,
  VaultLockTaskRepositoryPort,
} from "../../ports/vault/vault-lock-task-repository.port";
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

type PreparedCleanup = {
  readonly result: "cleaned" | "session_unavailable" | "stale_action";
  readonly lockActionId?: string;
  readonly error?: unknown;
};

type LockTaskSource =
  | { readonly kind: "load" }
  | {
      readonly kind: "authenticated";
      readonly task: VaultLockTask;
      readonly initialError?: unknown;
    };

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
    if (params.actionId === undefined) {
      const prepared = await this.prepareCleanup(params, coordinationLease, {
        kind: "load",
      });
      return this.finalizePreparedCleanup(prepared);
    }

    let initialTaskReadError: unknown;

    try {
      const initialTask = await this.vaultLockTasks.get();
      if (initialTask === null || initialTask.actionId !== params.actionId) {
        return "stale_action";
      }
    } catch (error) {
      initialTaskReadError = error;
    }

    let claimed:
      | { readonly status: "executed"; readonly result: PreparedCleanup }
      | { readonly status: "stale_action" };

    try {
      claimed = await this.vaultLockTasks.runIfActionIsActive(
        params.actionId,
        (task) =>
          this.prepareCleanup(params, coordinationLease, {
            kind: "authenticated",
            task,
            ...(initialTaskReadError === undefined
              ? {}
              : { initialError: initialTaskReadError }),
          }),
      );
    } catch (error) {
      throw initialTaskReadError ?? error;
    }

    if (claimed.status === "stale_action") {
      return "stale_action";
    }

    return this.finalizePreparedCleanup(claimed.result);
  }

  private async prepareCleanup(
    params: VaultLifecycleCleanupParams,
    coordinationLease: ClipboardOperationLease,
    lockTaskSource: LockTaskSource,
  ): Promise<PreparedCleanup> {
    let staleAction = false;
    let staleActionError: unknown;
    let taskCleanupError: unknown;
    let lockActionId: string | undefined;
    let sessionRecordsRemoved = false;
    let result: "removed" | "session_unavailable" | "stale_action";

    try {
      result = await this.unlockedVaultSession.cleanupActiveSession(
        params.requiredVaultId,
        params.actionId === undefined,
        async (activeSession) => {
          const taskCleanup = await this.cleanupTasks(
            activeSession?.vaultId ?? params.requiredVaultId,
            lockTaskSource,
          );
          if (taskCleanup.status === "stale_action") {
            staleAction = true;
            staleActionError = taskCleanup.error;
          } else {
            lockActionId = taskCleanup.lockActionId;
            taskCleanupError = taskCleanup.error;
          }
          return !staleAction;
        },
        async () => {
          sessionRecordsRemoved = true;
          if (taskCleanupError === undefined) {
            await params.afterSessionRemoval?.();
          }
        },
        coordinationLease,
        {
          removeRecordsWhenUnavailableAfterAuthorization:
            lockTaskSource.kind === "authenticated",
        },
      );
    } catch (error) {
      if (sessionRecordsRemoved) {
        return {
          result: "cleaned",
          ...(lockActionId === undefined ? {} : { lockActionId }),
          error: taskCleanupError ?? error,
        };
      }

      throw taskCleanupError ?? error;
    }

    if (staleActionError !== undefined) {
      throw staleActionError;
    }

    return {
      result:
        staleAction || result === "stale_action"
          ? "stale_action"
          : result === "session_unavailable"
            ? result
            : "cleaned",
      ...(lockActionId === undefined ? {} : { lockActionId }),
      ...(taskCleanupError === undefined ? {} : { error: taskCleanupError }),
    };
  }

  private async finalizePreparedCleanup(
    prepared: PreparedCleanup,
  ): Promise<"cleaned" | "session_unavailable" | "stale_action"> {
    if (prepared.result === "stale_action") {
      return prepared.result;
    }

    let finalizationError: unknown;

    try {
      await this.finalizeLockTask(prepared.lockActionId);
    } catch (error) {
      finalizationError = error;
    }

    if (prepared.error !== undefined) {
      throw prepared.error;
    }

    if (finalizationError !== undefined) {
      throw finalizationError;
    }

    return prepared.result;
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
        const taskCleanup = await this.cleanupTasks(params.vaultId, {
          kind: "load",
        });
        let finalizationError: unknown;

        if (taskCleanup.status === "cleaned") {
          try {
            await this.finalizeLockTask(taskCleanup.lockActionId);
          } catch (error) {
            finalizationError = error;
          }

          if (taskCleanup.error !== undefined) {
            throw taskCleanup.error;
          }
        }

        if (finalizationError !== undefined) {
          throw finalizationError;
        }
      },
      discard,
      coordinationLease,
    );
  }

  private async cleanupTasks(
    expectedVaultId: string | undefined,
    lockTaskSource: LockTaskSource,
  ): Promise<
    | {
        readonly status: "cleaned";
        readonly lockActionId?: string;
        readonly error?: unknown;
      }
    | { readonly status: "stale_action"; readonly error?: unknown }
  > {
    let firstError =
      lockTaskSource.kind === "authenticated"
        ? lockTaskSource.initialError
        : undefined;
    let vaultLockTask: Awaited<ReturnType<VaultLockTaskRepositoryPort["get"]>>;

    if (lockTaskSource.kind === "authenticated") {
      vaultLockTask = lockTaskSource.task;
    } else {
      try {
        vaultLockTask = await this.vaultLockTasks.get();
      } catch (error) {
        firstError = error;
        vaultLockTask = null;
      }
    }

    if (
      lockTaskSource.kind === "authenticated" &&
      expectedVaultId !== undefined &&
      lockTaskSource.task.vaultId !== expectedVaultId
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

    return {
      status: "cleaned",
      ...(vaultLockTask === null
        ? {}
        : { lockActionId: vaultLockTask.actionId }),
      ...(firstError === undefined ? {} : { error: firstError }),
    };
  }

  private async finalizeLockTask(actionId: string | undefined): Promise<void> {
    if (actionId === undefined) {
      return;
    }

    await this.vaultLockTasks.removeIfActionIsActive(actionId);
    await this.scheduledTasks.cancelTask({
      name: "lockVault",
      actionId,
    });
  }
}
