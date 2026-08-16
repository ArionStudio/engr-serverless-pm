import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createUnlockedVaultWithEntries,
  saveUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import {
  UnlockedVaultSessionExpiredError,
  VaultMustBeUnlockedError,
} from "../../errors/vault-session.errors";
import type {
  ClipboardClearTask,
  ClipboardClearTaskRepositoryPort,
} from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type {
  ClipboardOperationCoordinatorPort,
  ClipboardOperationLease,
} from "../../ports/clipboard/clipboard-operation-coordinator.port";
import type { ClipboardPort } from "../../ports/clipboard/clipboard.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type {
  VaultLockTask,
  VaultLockTaskRepositoryPort,
} from "../../ports/vault/vault-lock-task-repository.port";
import { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";
import { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { VaultLifecycleCleanupService } from "../../services/session/vault-lifecycle-cleanup.service";
import { VaultSessionActivationService } from "../../services/session/vault-session-activation.service";
import { LockVaultUseCase } from "../vault-lifecycle/lock-vault";
import { ClearClipboardTaskUseCase } from "./clear-clipboard-task";
import { CopyEntryPasswordUseCase } from "./copy-entry-password";

class SerializedClipboardOperationCoordinator implements ClipboardOperationCoordinatorPort {
  private tail: Promise<void> = Promise.resolve();
  private readonly activeLeases = new WeakSet<ClipboardOperationLease>();

  isLeaseActive(lease: ClipboardOperationLease): boolean {
    return this.activeLeases.has(lease);
  }

  runExclusive<T>(
    operation: (lease: ClipboardOperationLease) => Promise<T>,
  ): Promise<T> {
    const previous = this.tail;
    let release = (): void => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    return previous
      .then(async () => {
        const lease = Object.freeze({}) as ClipboardOperationLease;
        this.activeLeases.add(lease);

        try {
          return await operation(lease);
        } finally {
          this.activeLeases.delete(lease);
        }
      })
      .finally(release);
  }
}

type PausePhase =
  | "afterTaskRead"
  | "afterTaskSave"
  | "beforeClipboardWrite"
  | "beforeHashDecision"
  | "beforeSchedule";

function createDeferred() {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const secondPasswordEntry = {
    ...singlePasswordEntry,
    id: "second-entry-id",
    login: "second-login",
    password: "second-password",
  };

  saveUnlockedVaultWithEntries(ports, values, [
    singlePasswordEntry,
    secondPasswordEntry,
  ]);
  vi.mocked(ports.ids.generateId).mockReset();
  vi.mocked(ports.ids.generateId)
    .mockResolvedValueOnce("action-a")
    .mockResolvedValueOnce("action-b")
    .mockResolvedValueOnce("action-c");

  let clipboardValue = "";
  let currentTask: ClipboardClearTask | null = null;
  let pause:
    | {
        readonly phase: PausePhase;
        readonly reached: ReturnType<typeof createDeferred>;
        readonly release: ReturnType<typeof createDeferred>;
      }
    | undefined;
  let nextScheduleError: Error | undefined;
  let nextClipboardWriteError: Error | undefined;

  const pauseIfRequested = async (phase: PausePhase): Promise<void> => {
    if (pause?.phase !== phase) {
      return;
    }

    const activePause = pause;
    pause = undefined;
    activePause.reached.resolve();
    await activePause.release.promise;
  };

  const clipboard: ClipboardPort = {
    readText: vi.fn(async () => clipboardValue),
    writeText: vi.fn(async (value) => {
      if (value !== "") {
        await pauseIfRequested("beforeClipboardWrite");

        if (nextClipboardWriteError !== undefined) {
          const error = nextClipboardWriteError;
          nextClipboardWriteError = undefined;
          throw error;
        }
      }

      clipboardValue = value;
    }),
  };
  const clipboardClearTasks: ClipboardClearTaskRepositoryPort = {
    save: vi.fn(async (task) => {
      currentTask = task;
      await pauseIfRequested("afterTaskSave");
    }),
    get: vi.fn(async () => {
      const task = currentTask;
      await pauseIfRequested("afterTaskRead");
      return task;
    }),
    remove: vi.fn(async () => {
      currentTask = null;
    }),
  };
  const scheduledActionIds = new Set<string>();
  const scheduledTasks: ScheduledTaskPort = {
    scheduleTask: vi.fn(async ({ task }) => {
      await pauseIfRequested("beforeSchedule");

      if (nextScheduleError !== undefined) {
        const error = nextScheduleError;
        nextScheduleError = undefined;
        throw error;
      }

      scheduledActionIds.add(task.actionId);
    }),
    cancelTask: vi.fn(async (task) => {
      scheduledActionIds.delete(task.actionId);
    }),
  };
  const clipboardOperations = new SerializedClipboardOperationCoordinator();
  const unlockedVaultSession = new UnlockedVaultSessionService(
    ports.unlockedVaultSessionMaterialRepository,
    ports.encryptedUnlockedVaultSessionPayloadRepository,
    ports.crypto,
    ports.ids,
    clipboardOperations,
  );
  const clock = {
    now: vi.fn(() => 1_000),
  };
  const compareSecretValueHash = vi.mocked(
    ports.clipboardSecretHash.compareSecretValueHash,
  );
  const originalCompareSecretValueHash =
    compareSecretValueHash.getMockImplementation();
  compareSecretValueHash.mockImplementation(async (...params) => {
    await pauseIfRequested("beforeHashDecision");

    if (originalCompareSecretValueHash === undefined) {
      throw new Error("Secret hash comparison fixture is missing.");
    }

    return originalCompareSecretValueHash(...params);
  });
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    clock,
    ports.clipboardSecretHash,
  );

  const createCopyUseCase = () =>
    new CopyEntryPasswordUseCase(
      clipboard,
      clipboardClear,
      clipboardOperations,
      ports.clipboardSecretHash,
      ports.ids,
      clipboardClearTasks,
      scheduledTasks,
      clock,
      unlockedVaultSession,
    );

  return {
    values,
    ports,
    entries: [singlePasswordEntry, secondPasswordEntry] as const,
    clipboard,
    clipboardClearTasks,
    scheduledTasks,
    copyA: createCopyUseCase(),
    copyB: createCopyUseCase(),
    clear: new ClearClipboardTaskUseCase(clipboardClear, clipboardOperations),
    lock: new LockVaultUseCase(
      new VaultLifecycleCleanupService(
        clipboardClear,
        clipboardClearTasks,
        clipboardOperations,
        scheduledTasks,
        ports.vaultLockTasks,
        unlockedVaultSession,
      ),
    ),
    getClipboardValue: () => clipboardValue,
    getCurrentTask: () => currentTask,
    getScheduledActionIds: () => new Set(scheduledActionIds),
    pauseAt(phase: PausePhase) {
      const requestedPause = {
        phase,
        reached: createDeferred(),
        release: createDeferred(),
      };
      pause = requestedPause;
      return requestedPause;
    },
    failNextSchedule(error: Error) {
      nextScheduleError = error;
    },
    failNextClipboardWrite(error: Error) {
      nextClipboardWriteError = error;
    },
  };
}

function copyParams(
  ctx: ReturnType<typeof createContext>,
  entry: (typeof ctx.entries)[number],
) {
  return {
    vaultId: ctx.values.vaultId,
    entryId: entry.id,
    clearAfterMs: 60_000 as const,
  };
}

describe("clipboard operation coordination", () => {
  it.each(["afterTaskRead", "afterTaskSave", "beforeClipboardWrite"] as const)(
    "serializes copies paused at %s in invocation order",
    async (phase) => {
      const ctx = createContext();
      const pause = ctx.pauseAt(phase);
      const firstCopy = ctx.copyA.execute(copyParams(ctx, ctx.entries[0]));

      await pause.reached.promise;
      const secondCopy = ctx.copyB.execute(copyParams(ctx, ctx.entries[1]));

      expect(ctx.clipboardClearTasks.get).toHaveBeenCalledTimes(1);
      pause.release.resolve();
      await Promise.all([firstCopy, secondCopy]);

      expect(ctx.getClipboardValue()).toBe(ctx.entries[1].password);
      expect(ctx.getCurrentTask()).toEqual({
        actionId: "action-b",
        copiedValueHash: `hash:${ctx.entries[1].password}`,
        expiresAt: 61_000,
      });
      expect(ctx.getScheduledActionIds()).toEqual(new Set(["action-b"]));
    },
  );

  it.each(["afterTaskRead", "afterTaskSave", "beforeClipboardWrite"] as const)(
    "serializes copies paused at %s in reverse order",
    async (phase) => {
      const ctx = createContext();
      const pause = ctx.pauseAt(phase);
      const firstCopy = ctx.copyA.execute(copyParams(ctx, ctx.entries[1]));

      await pause.reached.promise;
      const secondCopy = ctx.copyB.execute(copyParams(ctx, ctx.entries[0]));

      expect(ctx.clipboardClearTasks.get).toHaveBeenCalledTimes(1);
      pause.release.resolve();
      await Promise.all([firstCopy, secondCopy]);

      expect(ctx.getClipboardValue()).toBe(ctx.entries[0].password);
      expect(ctx.getCurrentTask()).toEqual({
        actionId: "action-b",
        copiedValueHash: `hash:${ctx.entries[0].password}`,
        expiresAt: 61_000,
      });
      expect(ctx.getScheduledActionIds()).toEqual(new Set(["action-b"]));
    },
  );

  it("keeps newer ownership when a stale alarm waits for a copy", async () => {
    const ctx = createContext();

    await ctx.copyA.execute(copyParams(ctx, ctx.entries[0]));
    const pause = ctx.pauseAt("afterTaskSave");
    const newerCopy = ctx.copyB.execute(copyParams(ctx, ctx.entries[1]));
    await pause.reached.promise;
    const staleClear = ctx.clear.execute({
      actionId: "action-a",
      requireExpired: false,
    });

    pause.release.resolve();
    await expect(newerCopy).resolves.toEqual({ copied: true });
    await expect(staleClear).resolves.toEqual({
      cleared: false,
      reason: "staleAction",
    });
    expect(ctx.getClipboardValue()).toBe(ctx.entries[1].password);
    expect(ctx.getCurrentTask()?.actionId).toBe("action-b");
    expect(ctx.getScheduledActionIds()).toEqual(new Set(["action-b"]));
  });

  it("finishes a hash-mismatch clear before a newer copy can store ownership", async () => {
    const ctx = createContext();

    await ctx.copyA.execute(copyParams(ctx, ctx.entries[0]));
    vi.mocked(ctx.clipboard.readText).mockResolvedValueOnce("other-value");
    const pause = ctx.pauseAt("beforeHashDecision");
    const clear = ctx.clear.execute({
      actionId: "action-a",
      requireExpired: false,
    });
    await pause.reached.promise;
    const newerCopy = ctx.copyB.execute(copyParams(ctx, ctx.entries[1]));

    pause.release.resolve();
    await expect(clear).resolves.toEqual({
      cleared: false,
      reason: "clipboardChanged",
    });
    await expect(newerCopy).resolves.toEqual({ copied: true });
    expect(ctx.getClipboardValue()).toBe(ctx.entries[1].password);
    expect(ctx.getCurrentTask()?.actionId).toBe("action-b");
  });

  it.each(["schedule", "clipboardWrite"] as const)(
    "finishes %s failure cleanup before a newer copy enters",
    async (failure) => {
      const ctx = createContext();
      const error = new Error(`${failure} failed`);
      const pause = ctx.pauseAt(
        failure === "schedule" ? "beforeSchedule" : "beforeClipboardWrite",
      );

      if (failure === "schedule") {
        ctx.failNextSchedule(error);
      } else {
        ctx.failNextClipboardWrite(error);
      }

      const failedCopy = ctx.copyA.execute(copyParams(ctx, ctx.entries[0]));
      await pause.reached.promise;
      const newerCopy = ctx.copyB.execute(copyParams(ctx, ctx.entries[1]));

      pause.release.resolve();
      await expect(failedCopy).rejects.toBe(error);
      await expect(newerCopy).resolves.toEqual({ copied: true });
      expect(ctx.getClipboardValue()).toBe(ctx.entries[1].password);
      expect(ctx.getCurrentTask()?.actionId).toBe("action-b");
      expect(ctx.getScheduledActionIds()).toEqual(new Set(["action-b"]));
    },
  );

  it("clears a copy when lock waits for the in-flight operation", async () => {
    const ctx = createContext();
    const pause = ctx.pauseAt("beforeClipboardWrite");
    const copy = ctx.copyA.execute(copyParams(ctx, ctx.entries[0]));
    await pause.reached.promise;
    const lock = ctx.lock.execute();

    pause.release.resolve();
    await expect(copy).resolves.toEqual({ copied: true });
    await expect(lock).resolves.toBeUndefined();
    expect(ctx.getClipboardValue()).toBe("");
    expect(ctx.getCurrentTask()).toBeNull();
    expect(ctx.getScheduledActionIds()).toEqual(new Set());
  });

  it("rejects a copy that waits for an in-flight lock", async () => {
    const ctx = createContext();
    const pause = ctx.pauseAt("afterTaskRead");
    const lock = ctx.lock.execute();
    await pause.reached.promise;
    const copy = ctx.copyA.execute(copyParams(ctx, ctx.entries[0]));

    pause.release.resolve();
    await expect(lock).resolves.toBeUndefined();
    await expect(copy).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
    expect(ctx.getClipboardValue()).toBe("");
    expect(ctx.getCurrentTask()).toBeNull();
    expect(ctx.getScheduledActionIds()).toEqual(new Set());
  });

  it("invalidates another context's earlier activation authorization during scheduled cleanup", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const unlockedVault = createUnlockedVaultWithEntries(values, []);
    saveUnlockedVaultWithEntries(ports, values, []);

    const lockActionId = "scheduled-lock-action";
    let activeLockTask: VaultLockTask | null = {
      actionId: lockActionId,
      vaultId: values.vaultId,
      expiresAt: values.timestamp,
    };
    const removalReached = createDeferred();
    const removalCanFinish = createDeferred();
    const vaultLockTasks: VaultLockTaskRepositoryPort = {
      save: vi.fn(async (task) => {
        activeLockTask = task;
      }),
      get: vi.fn(async () => activeLockTask),
      removeIfActionIsActive: vi.fn(async (actionId) => {
        if (activeLockTask?.actionId !== actionId) {
          return false;
        }

        activeLockTask = null;
        removalReached.resolve();
        await removalCanFinish.promise;
        return true;
      }),
    };
    const clipboard: ClipboardPort = {
      readText: vi.fn(async () => ""),
      writeText: vi.fn(async () => undefined),
    };
    const clipboardClearTasks: ClipboardClearTaskRepositoryPort = {
      save: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      remove: vi.fn(async () => undefined),
    };
    const clipboardClear = new ClipboardClearService(
      clipboard,
      clipboardClearTasks,
      ports.clock,
      ports.clipboardSecretHash,
    );
    const clipboardOperations = new SerializedClipboardOperationCoordinator();
    const activationSession = new UnlockedVaultSessionService(
      ports.unlockedVaultSessionMaterialRepository,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      clipboardOperations,
    );
    const cleanupSession = new UnlockedVaultSessionService(
      ports.unlockedVaultSessionMaterialRepository,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      clipboardOperations,
    );
    const activationAuthorization =
      await activationSession.requireVaultCanBeActivated(values.vaultId);
    const lock = new LockVaultUseCase(
      new VaultLifecycleCleanupService(
        clipboardClear,
        clipboardClearTasks,
        clipboardOperations,
        ports.scheduledTasks,
        vaultLockTasks,
        cleanupSession,
      ),
    );
    const activation = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      ports.scheduledTasks,
      vaultLockTasks,
      activationSession,
      clipboardOperations,
    );

    const cleanup = lock.execute({ actionId: lockActionId });
    await removalReached.promise;
    const replacement = activation.activate({
      activationAuthorization,
      unlockedVault,
      sourceSnapshotVersionVector: { [values.deviceId]: 2 },
      lockAfterMs: 60_000,
    });

    await Promise.resolve();
    expect(vaultLockTasks.save).not.toHaveBeenCalled();

    removalCanFinish.resolve();
    await expect(cleanup).resolves.toBeUndefined();
    await expect(replacement).rejects.toBeInstanceOf(
      UnlockedVaultSessionExpiredError,
    );

    await expect(activationSession.get()).resolves.toBeNull();
    expect(activeLockTask).toBeNull();
    expect(ports.saved.unlockedVaultSessionEpoch).toBe(1);
    expect(vaultLockTasks.save).not.toHaveBeenCalled();
  });
});
