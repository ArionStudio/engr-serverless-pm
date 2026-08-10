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
      activationGeneration: firstGeneration,
    });
    await scheduleStarted;
    const competingActivation = service.activate({
      ...params,
      activationGeneration: competingGeneration,
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
    vi.mocked(ports.ids.generateId).mockReset().mockResolvedValue("new-action-id");
    const service = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      scheduledTasks,
      vaultLockTasks,
      ports.sessionServices.unlockedVaultSession,
    );
    const generation =
      await ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        values.vaultId,
      );

    await expect(
      service.activate({
        activationGeneration: generation,
        unlockedVault,
        sourceSnapshotVersionVector: { [values.deviceId]: 1 },
        lockAfterMs: 60_000,
      }),
    ).rejects.toBe(scheduleError);

    expect(activeLockTask).toBeNull();
    expect(scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: "new-action-id",
    });
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
    vi.mocked(ports.ids.generateId).mockReset().mockResolvedValue("new-action-id");
    const service = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      scheduledTasks,
      vaultLockTasks,
      ports.sessionServices.unlockedVaultSession,
    );
    const generation =
      await ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        values.vaultId,
      );

    await expect(
      service.activate({
        activationGeneration: generation,
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
});
