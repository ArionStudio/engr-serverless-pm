import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  saveUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import type { ClipboardPort } from "../../ports/clipboard/clipboard.port";
import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import { InvalidClipboardClearDelayError } from "../__errors/clipboard.errors";
import { PasswordEntryNotFoundError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import { ClearClipboardTaskUseCase } from "./clear-clipboard-task";
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

  const clipboard: ClipboardPort = {
    readText: vi.fn(async () => ""),
    writeText: vi.fn(async () => undefined),
  };
  const clipboardClearTasks: ClipboardClearTaskRepositoryPort = {
    save: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
  };
  const scheduledTasks: ScheduledTaskPort = {
    scheduleTask: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
  };
  const clock = {
    now: vi.fn(() => 1_000),
  };
  const clearClipboardTask = new ClearClipboardTaskUseCase(
    clipboard,
    clipboardClearTasks,
    clock,
    ports.crypto,
  );

  return {
    values,
    ports,
    clipboard,
    clipboardClearTasks,
    scheduledTasks,
    clock,
    useCase: new CopyEntryPasswordUseCase(
      clipboard,
      clearClipboardTask,
      ports.crypto,
      ports.ids,
      clipboardClearTasks,
      scheduledTasks,
      clock,
      ports.unlockedVaultRepository,
    ),
  };
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
      ctx.ports.unlockedVaultRepository.getUnlockedVaultSession,
    ).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
  });
});
