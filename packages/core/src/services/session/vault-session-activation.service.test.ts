import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { UnlockedVaultSessionExpiredError } from "../../errors/vault-session.errors";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type {
  VaultLockTask,
  VaultLockTaskRepositoryPort,
} from "../../ports/vault/vault-lock-task-repository.port";
import { VaultSessionActivationService } from "./vault-session-activation.service";

describe("VaultSessionActivationService", () => {
  it("does not prepare activation when coordination is unavailable", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const unlockedVault = createUnlockedVaultWithEntries(values, []);
    const coordinationError = new Error("coordination unavailable");
    const generation =
      await ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        values.vaultId,
      );
    const service = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      ports.sessionServices.unlockedVaultSession,
      {
        isLeaseActive: () => false,
        runExclusive: async () => {
          throw coordinationError;
        },
      },
    );
    const prepareActivation = vi.fn(async () => undefined);

    await expect(
      service.activate({
        activationAuthorization: generation,
        unlockedVault,
        sourceSnapshotVersionVector: { [values.deviceId]: 1 },
        lockAfterMs: 60_000,
        prepareActivation,
      }),
    ).rejects.toBe(coordinationError);

    expect(prepareActivation).not.toHaveBeenCalled();
    expect(ports.vaultLockTasks.save).not.toHaveBeenCalled();
    expect(ports.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
    expect(ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("does not prepare activation when the shared session epoch cannot advance", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const unlockedVault = createUnlockedVaultWithEntries(values, []);
    const error = new Error("session epoch unavailable");
    const activationAuthorization =
      await ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        values.vaultId,
      );
    vi.mocked(
      ports.unlockedVaultSessionMaterialRepository
        .advanceUnlockedVaultSessionEpoch,
    ).mockRejectedValueOnce(error);
    const service = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      ports.sessionServices.unlockedVaultSession,
      ports.clipboardOperations,
    );
    const prepareActivation = vi.fn(async () => undefined);

    await expect(
      service.activate({
        activationAuthorization,
        unlockedVault,
        sourceSnapshotVersionVector: { [values.deviceId]: 1 },
        lockAfterMs: 60_000,
        prepareActivation,
      }),
    ).rejects.toBe(error);

    expect(prepareActivation).not.toHaveBeenCalled();
    expect(ports.vaultLockTasks.save).not.toHaveBeenCalled();
    expect(ports.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
    expect(
      ports.crypto.encryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("serializes competing auto-lock installation and session activation", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const unlockedVault = createUnlockedVaultWithEntries(values, []);
    let activeLockTask: VaultLockTask | null = null;
    const vaultLockTasks: VaultLockTaskRepositoryPort = {
      save: vi.fn(async (task) => {
        activeLockTask = task;
      }),
      get: vi.fn(async () => activeLockTask),
      runIfActionIsActive: async (actionId, operation) => {
        if (activeLockTask?.actionId !== actionId) {
          return { status: "stale_action" };
        }

        return {
          status: "executed",
          result: await operation(activeLockTask),
        };
      },
      removeIfActionIsActive: vi.fn(async (actionId) => {
        if (activeLockTask?.actionId !== actionId) {
          return false;
        }

        activeLockTask = null;
        return true;
      }),
    };
    let releaseSchedule = (): void => undefined;
    let markScheduleStarted = (): void => undefined;
    const scheduleStarted = new Promise<void>((resolve) => {
      markScheduleStarted = resolve;
    });
    const scheduleCanFinish = new Promise<void>((resolve) => {
      releaseSchedule = resolve;
    });
    const scheduledTasks: ScheduledTaskPort = {
      scheduleTask: vi.fn(async () => {
        markScheduleStarted();
        await scheduleCanFinish;
      }),
      cancelTask: vi.fn(async () => undefined),
    };
    vi.mocked(ports.ids.generateId)
      .mockReset()
      .mockResolvedValueOnce(values.vaultLockActionId)
      .mockResolvedValueOnce(values.sessionId);
    const service = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      scheduledTasks,
      vaultLockTasks,
      ports.sessionServices.unlockedVaultSession,
      ports.clipboardOperations,
    );
    const firstGeneration =
      await ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        values.vaultId,
      );
    const competingGeneration =
      await ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        values.vaultId,
      );
    const params = {
      unlockedVault,
      sourceSnapshotVersionVector: { [values.deviceId]: 1 },
      lockAfterMs: 60_000,
    } as const;

    const firstActivation = service.activate({
      ...params,
      activationAuthorization: firstGeneration,
    });
    await scheduleStarted;
    const competingPrepare = vi.fn(async () => undefined);
    const competingRollback = vi.fn(async () => undefined);
    const competingActivation = service.activate({
      ...params,
      activationAuthorization: competingGeneration,
      prepareActivation: competingPrepare,
      rollbackPreparedActivation: competingRollback,
    });
    releaseSchedule();

    await expect(firstActivation).resolves.toEqual({
      sessionId: values.sessionId,
      generation: 1,
    });
    await expect(competingActivation).rejects.toBeInstanceOf(
      UnlockedVaultSessionExpiredError,
    );
    expect(vaultLockTasks.save).toHaveBeenCalledTimes(1);
    expect(scheduledTasks.scheduleTask).toHaveBeenCalledTimes(1);
    expect(competingPrepare).not.toHaveBeenCalled();
    expect(competingRollback).not.toHaveBeenCalled();
    expect(activeLockTask).toMatchObject({
      actionId: values.vaultLockActionId,
      vaultId: values.vaultId,
    });
    expect(ports.saved.unlockedVaultSession).toBeDefined();
  });

  it("invalidates an existing session when replacement scheduling fails", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const unlockedVault = createUnlockedVaultWithEntries(values, []);
    ports.saved.unlockedVaultSession = {
      sessionId: values.sessionId,
      unlockedVault,
      sourceSnapshotVersionVector: { [values.deviceId]: 1 },
    };
    let activeLockTask: VaultLockTask | null = {
      actionId: "existing-lock-action-id",
      vaultId: values.vaultId,
      expiresAt: values.timestamp + 30_000,
    };
    const vaultLockTasks: VaultLockTaskRepositoryPort = {
      save: vi.fn(async (task) => {
        activeLockTask = task;
      }),
      get: vi.fn(async () => activeLockTask),
      runIfActionIsActive: async (actionId, operation) => {
        if (activeLockTask?.actionId !== actionId) {
          return { status: "stale_action" };
        }

        return {
          status: "executed",
          result: await operation(activeLockTask),
        };
      },
      removeIfActionIsActive: vi.fn(async (actionId) => {
        if (activeLockTask?.actionId !== actionId) {
          return false;
        }

        activeLockTask = null;
        return true;
      }),
    };
    const scheduleError = new Error("schedule failed");
    const scheduledTasks: ScheduledTaskPort = {
      scheduleTask: vi.fn(async () => {
        throw scheduleError;
      }),
      cancelTask: vi.fn(async () => undefined),
    };
    vi.mocked(ports.ids.generateId)
      .mockReset()
      .mockResolvedValue("new-action-id");
    const service = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      scheduledTasks,
      vaultLockTasks,
      ports.sessionServices.unlockedVaultSession,
      ports.clipboardOperations,
    );
    const generation =
      await ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        values.vaultId,
      );
    const prepareActivation = vi.fn(async () => undefined);
    const rollbackPreparedActivation = vi.fn(async () => undefined);

    await expect(
      service.activate({
        activationAuthorization: generation,
        unlockedVault,
        sourceSnapshotVersionVector: { [values.deviceId]: 1 },
        lockAfterMs: 60_000,
        prepareActivation,
        rollbackPreparedActivation,
      }),
    ).rejects.toBe(scheduleError);

    expect(activeLockTask).toBeNull();
    expect(scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: "new-action-id",
    });
    expect(rollbackPreparedActivation).toHaveBeenCalledOnce();
    expect(ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("does not roll back persistence when activation preparation fails", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const unlockedVault = createUnlockedVaultWithEntries(values, []);
    const prepareError = new Error("prepare failed");
    const prepareActivation = vi.fn(async () => {
      throw prepareError;
    });
    const rollbackPreparedActivation = vi.fn(async () => undefined);
    const service = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      ports.sessionServices.unlockedVaultSession,
      ports.clipboardOperations,
    );
    const generation =
      await ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        values.vaultId,
      );

    await expect(
      service.activate({
        activationAuthorization: generation,
        unlockedVault,
        sourceSnapshotVersionVector: { [values.deviceId]: 1 },
        lockAfterMs: 60_000,
        prepareActivation,
        rollbackPreparedActivation,
      }),
    ).rejects.toBe(prepareError);

    expect(rollbackPreparedActivation).not.toHaveBeenCalled();
    expect(ports.vaultLockTasks.save).not.toHaveBeenCalled();
    expect(ports.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
    expect(ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("invalidates an existing session when replacement protection fails", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const unlockedVault = createUnlockedVaultWithEntries(values, []);
    ports.saved.unlockedVaultSession = {
      sessionId: values.sessionId,
      unlockedVault,
      sourceSnapshotVersionVector: { [values.deviceId]: 1 },
    };
    let activeLockTask: VaultLockTask | null = {
      actionId: "existing-lock-action-id",
      vaultId: values.vaultId,
      expiresAt: values.timestamp + 30_000,
    };
    const vaultLockTasks: VaultLockTaskRepositoryPort = {
      save: vi.fn(async (task) => {
        activeLockTask = task;
      }),
      get: vi.fn(async () => activeLockTask),
      runIfActionIsActive: async (actionId, operation) => {
        if (activeLockTask?.actionId !== actionId) {
          return { status: "stale_action" };
        }

        return {
          status: "executed",
          result: await operation(activeLockTask),
        };
      },
      removeIfActionIsActive: vi.fn(async (actionId) => {
        if (activeLockTask?.actionId !== actionId) {
          return false;
        }

        activeLockTask = null;
        return true;
      }),
    };
    const scheduledTasks: ScheduledTaskPort = {
      scheduleTask: vi.fn(async () => undefined),
      cancelTask: vi.fn(async () => undefined),
    };
    const protectionError = new Error("protection failed");
    vi.mocked(
      ports.crypto.encryptUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(protectionError);
    vi.mocked(ports.ids.generateId)
      .mockReset()
      .mockResolvedValue("new-action-id");
    const service = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      scheduledTasks,
      vaultLockTasks,
      ports.sessionServices.unlockedVaultSession,
      ports.clipboardOperations,
    );
    const generation =
      await ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        values.vaultId,
      );

    await expect(
      service.activate({
        activationAuthorization: generation,
        unlockedVault,
        sourceSnapshotVersionVector: { [values.deviceId]: 1 },
        lockAfterMs: 60_000,
      }),
    ).rejects.toBe(protectionError);

    expect(activeLockTask).toBeNull();
    expect(scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: "new-action-id",
    });
    expect(ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("preserves a newer lock action when activation rollback runs", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const unlockedVault = createUnlockedVaultWithEntries(values, []);
    const failedActionId = "failed-action-id";
    const newerLockTask: VaultLockTask = {
      actionId: "newer-action-id",
      vaultId: values.vaultId,
      expiresAt: values.timestamp + 120_000,
    };
    let activeLockTask: VaultLockTask | null = null;
    const vaultLockTasks: VaultLockTaskRepositoryPort = {
      save: vi.fn(async (task) => {
        activeLockTask = task;
      }),
      get: vi.fn(async () => activeLockTask),
      runIfActionIsActive: async (actionId, operation) => {
        if (activeLockTask?.actionId !== actionId) {
          return { status: "stale_action" };
        }

        return {
          status: "executed",
          result: await operation(activeLockTask),
        };
      },
      removeIfActionIsActive: vi.fn(async (actionId) => {
        if (activeLockTask?.actionId !== actionId) {
          return false;
        }

        activeLockTask = null;
        return true;
      }),
    };
    const scheduledTasks: ScheduledTaskPort = {
      scheduleTask: vi.fn(async () => undefined),
      cancelTask: vi.fn(async () => undefined),
    };
    const protectionError = new Error("protection failed");
    vi.mocked(
      ports.crypto.encryptUnlockedVaultSessionPayload,
    ).mockImplementationOnce(async () => {
      activeLockTask = newerLockTask;
      throw protectionError;
    });
    vi.mocked(ports.ids.generateId)
      .mockReset()
      .mockResolvedValueOnce(failedActionId)
      .mockResolvedValueOnce(values.sessionId);
    const service = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      scheduledTasks,
      vaultLockTasks,
      ports.sessionServices.unlockedVaultSession,
      ports.clipboardOperations,
    );
    const generation =
      await ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        values.vaultId,
      );

    await expect(
      service.activate({
        activationAuthorization: generation,
        unlockedVault,
        sourceSnapshotVersionVector: { [values.deviceId]: 1 },
        lockAfterMs: 60_000,
      }),
    ).rejects.toBe(protectionError);

    expect(vaultLockTasks.removeIfActionIsActive).toHaveBeenCalledWith(
      failedActionId,
    );
    expect(activeLockTask).toBe(newerLockTask);
    expect(scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: failedActionId,
    });
    expect(ports.saved.unlockedVaultSession).toBeUndefined();
  });
});
