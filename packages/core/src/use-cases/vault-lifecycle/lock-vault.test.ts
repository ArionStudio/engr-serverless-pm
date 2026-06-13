import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  saveUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ClipboardPort } from "../../ports/clipboard/clipboard.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";
import { LockVaultUseCase } from "./lock-vault";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  saveUnlockedVaultWithEntries(ports, values, [singlePasswordEntry]);

  const clipboard: ClipboardPort = {
    readText: vi.fn(async () => singlePasswordEntry.password),
    writeText: vi.fn(async () => undefined),
  };
  const clipboardClearTasks: ClipboardClearTaskRepositoryPort = {
    save: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
  };
  const clock = {
    now: vi.fn(() => values.timestamp),
  };
  const scheduledTasks: ScheduledTaskPort = {
    scheduleTask: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
  };
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    clock,
    ports.crypto,
  );
  const useCase = new LockVaultUseCase(
    clipboardClear,
    clipboardClearTasks,
    scheduledTasks,
    ports.vaultLockTasks,
    ports.sessionServices.unlockedVaultSession,
  );

  return {
    values,
    ports,
    clipboard,
    clipboardClearTasks,
    scheduledTasks,
    useCase,
  };
}

describe("LockVaultUseCase", () => {
  it("removes the unlocked vault state", async () => {
    const ctx = createContext();

    await expect(ctx.useCase.execute()).resolves.toBeUndefined();

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
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
      ctx.ports.sessionServices.unlockedVaultSession.remove,
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

    expect(ctx.clipboardClearTasks.get).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
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
      ctx.ports.sessionServices.unlockedVaultSession.remove,
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
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.vaultLockTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("clears pending copied password before removing unlocked vault state", async () => {
    const ctx = createContext();
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(ctx.useCase.execute()).resolves.toBeUndefined();

    expect(ctx.clipboard.readText).toHaveBeenCalledTimes(1);
    expect(ctx.clipboard.writeText).toHaveBeenCalledWith("");
    expect(ctx.clipboardClearTasks.remove).toHaveBeenCalledTimes(1);
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalledTimes(1);
  });

  it("removes unlocked vault state when clipboard cleanup fails", async () => {
    const ctx = createContext();
    const error = new Error("clipboard unavailable");

    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboard.readText).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalledTimes(1);
  });

  it("removes unlocked vault state when reading lock task metadata fails", async () => {
    const ctx = createContext();
    const error = new Error("lock task metadata unavailable");

    vi.mocked(ctx.ports.vaultLockTasks.get).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toBe(error);

    expect(ctx.clipboardClearTasks.get).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalledTimes(1);
  });

  it("removes unlocked vault state when reading clipboard task metadata fails", async () => {
    const ctx = createContext();
    const error = new Error("clipboard task metadata unavailable");

    vi.mocked(ctx.clipboardClearTasks.get).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toBe(error);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalledTimes(1);
  });

  it("preserves clipboard cleanup error when unlocked vault state removal also fails", async () => {
    const ctx = createContext();
    const cleanupError = new Error("clipboard unavailable");
    const removeError = new Error("session removal failed");

    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboard.readText).mockRejectedValueOnce(cleanupError);
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).mockRejectedValueOnce(removeError);

    await expect(ctx.useCase.execute()).rejects.toBe(cleanupError);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalledTimes(1);
  });

  it("removes unlocked vault state when clipboard clear task cancellation fails", async () => {
    const ctx = createContext();
    const error = new Error("cancel failed");

    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.scheduledTasks.cancelTask).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);

    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(ctx.ports.vaultLockTasks.remove).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalledTimes(1);
  });

  it("bubbles repository errors", async () => {
    const ctx = createContext();
    const error = new Error("lock failed");

    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);
  });
});
