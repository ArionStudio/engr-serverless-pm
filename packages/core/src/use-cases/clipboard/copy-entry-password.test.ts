import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  saveUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import type { ClipboardPort } from "../../ports/clipboard/clipboard.port";
import type {
  ClipboardClearTask,
  ClipboardClearTaskRepositoryPort,
} from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import { InvalidClipboardClearDelayError } from "../../errors/clipboard.errors";
import { PasswordEntryNotFoundError } from "../../errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";
import { VaultLifecycleCleanupService } from "../../services/session/vault-lifecycle-cleanup.service";
import { LockVaultUseCase } from "../vault-lifecycle/lock-vault";
import {
  CopyEntryPasswordUseCase,
  type CopyEntryPasswordCommandParams,
} from "./copy-entry-password";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  saveUnlockedVaultWithEntries(ports, values, [singlePasswordEntry]);
  vi.mocked(ports.ids.generateId).mockReset();
  vi.mocked(ports.ids.generateId).mockResolvedValue("clipboard-action-id");

  let clipboardText = "";
  const clipboard: ClipboardPort = {
    readText: vi.fn(async () => clipboardText),
    writeText: vi.fn(async (value) => {
      clipboardText = value;
    }),
  };
  let activeClipboardClearTask: ClipboardClearTask | null = null;
  const clipboardClearTasks: ClipboardClearTaskRepositoryPort = {
    save: vi.fn(async (task) => {
      activeClipboardClearTask = task;
    }),
    get: vi.fn(async () => activeClipboardClearTask),
    remove: vi.fn(async () => {
      activeClipboardClearTask = null;
    }),
  };
  const scheduledTasks: ScheduledTaskPort = {
    scheduleTask: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
  };
  const clock = {
    now: vi.fn(() => 1_000),
  };
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    clock,
    ports.crypto,
  );

  return {
    values,
    ports,
    clipboard,
    clipboardClear,
    clipboardClearTasks,
    getClipboardText: () => clipboardText,
    scheduledTasks,
    clock,
    useCase: new CopyEntryPasswordUseCase(
      clipboard,
      clipboardClear,
      ports.crypto,
      ports.ids,
      clipboardClearTasks,
      scheduledTasks,
      clock,
      ports.sessionServices.unlockedVaultSession,
    ),
  };
}

function createLockVaultUseCase(ctx: ReturnType<typeof createContext>) {
  const lifecycleCleanup = new VaultLifecycleCleanupService(
    ctx.clipboardClear,
    ctx.clipboardClearTasks,
    ctx.scheduledTasks,
    ctx.ports.vaultLockTasks,
    ctx.ports.sessionServices.unlockedVaultSession,
  );

  return new LockVaultUseCase(lifecycleCleanup);
}

describe("CopyEntryPasswordUseCase", () => {
  it("copies the selected entry password and schedules clipboard clear", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        clearAfterMs: 60_000,
      }),
    ).resolves.toEqual({
      copied: true,
    });
    expect(ctx.clipboardClearTasks.save).toHaveBeenCalledWith({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: 61_000,
    });
    expect(ctx.scheduledTasks.scheduleTask).toHaveBeenCalledWith({
      task: {
        name: "clearClipboard",
        actionId: "clipboard-action-id",
      },
      runAt: 61_000,
    });
    expect(ctx.clipboard.writeText).toHaveBeenCalledWith(
      singlePasswordEntry.password,
    );
  });

  it("does not write to the clipboard when the vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        clearAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(ctx.clipboardClearTasks.save).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("does not copy a password after a concurrent lock wins", async () => {
    const ctx = createContext();
    let continueLock!: () => void;
    let markLockStarted!: () => void;
    const lockStarted = new Promise<void>((resolve) => {
      markLockStarted = resolve;
    });
    const lockCanContinue = new Promise<void>((resolve) => {
      continueLock = resolve;
    });
    vi.mocked(ctx.ports.vaultLockTasks.get).mockImplementationOnce(async () => {
      markLockStarted();
      await lockCanContinue;
      return null;
    });

    const lock = createLockVaultUseCase(ctx).execute();
    await lockStarted;
    const copy = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entryId: singlePasswordEntry.id,
      clearAfterMs: 60_000,
    });
    continueLock();

    await expect(lock).resolves.toBeUndefined();
    await expect(copy).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
    expect(ctx.clipboardClearTasks.save).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalledWith(
      singlePasswordEntry.password,
    );
    expect(ctx.getClipboardText()).toBe("");
  });

  it("waits for a concurrent copy and then clears it while locking", async () => {
    const ctx = createContext();
    let continueCopy!: () => void;
    let markCopyStarted!: () => void;
    const copyStarted = new Promise<void>((resolve) => {
      markCopyStarted = resolve;
    });
    const copyCanContinue = new Promise<void>((resolve) => {
      continueCopy = resolve;
    });
    vi.mocked(ctx.ports.ids.generateId).mockImplementationOnce(async () => {
      markCopyStarted();
      await copyCanContinue;
      return "clipboard-action-id";
    });

    const copy = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entryId: singlePasswordEntry.id,
      clearAfterMs: 60_000,
    });
    await copyStarted;
    let lockCompleted = false;
    const lock = createLockVaultUseCase(ctx)
      .execute()
      .then(() => {
        lockCompleted = true;
      });
    await Promise.resolve();
    expect(lockCompleted).toBe(false);
    continueCopy();

    await expect(copy).resolves.toEqual({ copied: true });
    await expect(lock).resolves.toBeUndefined();
    expect(ctx.clipboard.writeText).toHaveBeenCalledWith(
      singlePasswordEntry.password,
    );
    expect(ctx.clipboard.writeText).toHaveBeenLastCalledWith("");
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    await expect(ctx.clipboardClearTasks.get()).resolves.toBeNull();
    expect(ctx.getClipboardText()).toBe("");
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("reads the current entry after a queued snapshot commit", async () => {
    const ctx = createContext();
    const activeSession = ctx.ports.saved.unlockedVaultSession;

    if (activeSession === undefined) {
      throw new Error("Expected an active test session.");
    }

    const saveEncryptedPayload = vi.mocked(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .saveEncryptedUnlockedVaultSessionPayload,
    );
    const saveEncryptedPayloadOriginal =
      saveEncryptedPayload.getMockImplementation();

    if (saveEncryptedPayloadOriginal === undefined) {
      throw new Error("Expected a session-payload save implementation.");
    }

    let continueCommit!: () => void;
    let markCommitStarted!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const commitCanContinue = new Promise<void>((resolve) => {
      continueCommit = resolve;
    });
    saveEncryptedPayload.mockImplementationOnce(async (payload) => {
      markCommitStarted();
      await commitCanContinue;
      await saveEncryptedPayloadOriginal(payload);
    });
    const commit =
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot(
        activeSession.sessionId,
        {
          ...activeSession.unlockedVault,
          vault: {
            ...activeSession.unlockedVault.vault,
            entries: [],
          },
        },
        { [ctx.values.deviceId]: 2 },
      );
    await commitStarted;

    const copy = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entryId: singlePasswordEntry.id,
      clearAfterMs: 60_000,
    });
    continueCommit();

    await expect(commit).resolves.toBeUndefined();
    await expect(copy).rejects.toBeInstanceOf(PasswordEntryNotFoundError);
    expect(ctx.clipboardClearTasks.save).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalledWith(
      singlePasswordEntry.password,
    );
  });

  it("does not write to the clipboard when requested entry does not exist", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: "missing-entry",
        clearAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(PasswordEntryNotFoundError);

    expect(ctx.clipboardClearTasks.save).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("does not write to the clipboard when clipboard clear cannot be scheduled", async () => {
    const ctx = createContext();
    const error = new Error("schedule failed");
    vi.mocked(ctx.scheduledTasks.scheduleTask).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        clearAfterMs: 60_000,
      }),
    ).rejects.toThrow(error);

    expect(ctx.clipboardClearTasks.remove).toHaveBeenCalledTimes(1);
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("preserves scheduling failure when pending clipboard clear cleanup fails", async () => {
    const ctx = createContext();
    const scheduleError = new Error("schedule failed");
    const cleanupError = new Error("cleanup failed");

    vi.mocked(ctx.scheduledTasks.scheduleTask).mockRejectedValueOnce(
      scheduleError,
    );
    vi.mocked(ctx.clipboardClearTasks.remove).mockRejectedValueOnce(
      cleanupError,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        clearAfterMs: 60_000,
      }),
    ).rejects.toBe(scheduleError);

    expect(ctx.clipboardClearTasks.remove).toHaveBeenCalledTimes(1);
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("removes pending clipboard clear and cancels scheduled clear when clipboard write fails", async () => {
    const ctx = createContext();
    const error = new Error("clipboard failed");
    vi.mocked(ctx.clipboard.writeText).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        clearAfterMs: 60_000,
      }),
    ).rejects.toThrow(error);

    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    expect(ctx.clipboardClearTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("removes pending clipboard clear when canceling scheduled clear fails", async () => {
    const ctx = createContext();
    const clipboardError = new Error("clipboard failed");
    const cancelError = new Error("cancel failed");

    vi.mocked(ctx.clipboard.writeText).mockRejectedValueOnce(clipboardError);
    vi.mocked(ctx.scheduledTasks.cancelTask).mockRejectedValueOnce(cancelError);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        clearAfterMs: 60_000,
      }),
    ).rejects.toThrow(clipboardError);

    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    expect(ctx.clipboardClearTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("clears previous copied password before copying another password", async () => {
    const ctx = createContext();
    const previousClipboardClearTask = {
      actionId: "previous-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: 2_000,
    };

    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce(
      previousClipboardClearTask,
    );
    vi.mocked(ctx.clipboard.readText).mockResolvedValueOnce(
      singlePasswordEntry.password,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        clearAfterMs: 60_000,
      }),
    ).resolves.toEqual({
      copied: true,
    });

    expect(ctx.clipboard.writeText).toHaveBeenNthCalledWith(1, "");
    expect(ctx.clipboardClearTasks.remove).toHaveBeenCalledTimes(1);
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "previous-action-id",
    });
    expect(ctx.clipboard.writeText).toHaveBeenNthCalledWith(
      2,
      singlePasswordEntry.password,
    );
  });

  it("cancels previous scheduled clear when previous clipboard cleanup fails", async () => {
    const ctx = createContext();
    const error = new Error("clipboard unavailable");
    const previousClipboardClearTask = {
      actionId: "previous-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: 2_000,
    };

    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce(
      previousClipboardClearTask,
    );
    vi.mocked(ctx.clipboard.readText).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        clearAfterMs: 60_000,
      }),
    ).rejects.toThrow(error);

    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "previous-action-id",
    });
    expect(ctx.clipboardClearTasks.save).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalledWith(
      singlePasswordEntry.password,
    );
  });

  it("fails before reading the password when clear delay is invalid", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        clearAfterMs: 45_000,
      } as unknown as CopyEntryPasswordCommandParams),
    ).rejects.toBeInstanceOf(InvalidClipboardClearDelayError);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.get,
    ).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
  });
});
