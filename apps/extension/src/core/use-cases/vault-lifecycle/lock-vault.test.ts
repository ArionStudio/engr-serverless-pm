import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import type { ScheduledTaskPort } from "../../ports/scheduled-task.port";
import { LockVaultUseCase } from "./lock-vault";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  const scheduledTasks: ScheduledTaskPort = {
    scheduleTask: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
  };
  const useCase = new LockVaultUseCase(
    scheduledTasks,
    ports.vaultLockTasks,
    ports.unlockedVaultRepository,
  );

  return {
    values,
    ports,
    scheduledTasks,
    useCase,
  };
}

describe("LockVaultUseCase", () => {
  it("removes the unlocked vault state", async () => {
    const ctx = createContext();

    await expect(ctx.useCase.execute()).resolves.toBeUndefined();

    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).toHaveBeenCalledTimes(1);
  });

  it("cancels pending scheduled vault lock on manual lock", async () => {
    const ctx = createContext();

    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(ctx.useCase.execute()).resolves.toBeUndefined();

    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(ctx.ports.vaultLockTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("removes lock task metadata when canceling pending scheduled vault lock fails", async () => {
    const ctx = createContext();
    const error = new Error("cancel failed");

    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.scheduledTasks.cancelTask).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);

    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(ctx.ports.vaultLockTasks.remove).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).toHaveBeenCalledTimes(1);
  });

  it("ignores stale scheduled vault lock action", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(
      ctx.useCase.execute({
        actionId: "stale-vault-lock-action-id",
      }),
    ).resolves.toBeUndefined();

    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).not.toHaveBeenCalled();
  });

  it("locks current session for scheduled vault lock when metadata is missing", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        actionId: ctx.values.vaultLockActionId,
      }),
    ).resolves.toBeUndefined();

    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.vaultLockTasks.remove).not.toHaveBeenCalled();
  });

  it("locks current session for matching scheduled vault lock action", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(
      ctx.useCase.execute({
        actionId: ctx.values.vaultLockActionId,
      }),
    ).resolves.toBeUndefined();

    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.vaultLockTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("bubbles repository errors", async () => {
    const ctx = createContext();
    const error = new Error("lock failed");

    vi.mocked(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);
  });
});
