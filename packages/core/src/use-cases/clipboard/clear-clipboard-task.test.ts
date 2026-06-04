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
import { ClearClipboardTaskUseCase } from "./clear-clipboard-task";

function createContext(
  clipboardClearTask: ClipboardClearTask | null = {
    actionId: "clipboard-action-id",
    copiedValueHash: `hash:${singlePasswordEntry.password}`,
    expiresAt: 1_000,
  },
) {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  saveUnlockedVaultWithEntries(ports, values, [singlePasswordEntry]);

  const clipboard: ClipboardPort = {
    readText: vi.fn(async () => singlePasswordEntry.password),
    writeText: vi.fn(async () => undefined),
  };
  const clipboardClearTasks: ClipboardClearTaskRepositoryPort = {
    save: vi.fn(async () => undefined),
    get: vi.fn(async () => clipboardClearTask),
    remove: vi.fn(async () => undefined),
  };
  const clock = {
    now: vi.fn(() => 1_000),
  };

  return {
    values,
    ports,
    clipboard,
    clipboardClearTasks,
    clock,
    useCase: new ClearClipboardTaskUseCase(
      clipboard,
      clipboardClearTasks,
      clock,
      ports.crypto,
    ),
  };
}

describe("ClearClipboardTaskUseCase", () => {
  it("clears clipboard when pending copied value is still present", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        actionId: "clipboard-action-id",
        requireExpired: true,
      }),
    ).resolves.toEqual({
      cleared: true,
    });

    expect(ctx.clipboard.readText).toHaveBeenCalledTimes(1);
    expect(ctx.clipboard.writeText).toHaveBeenCalledWith("");
    expect(ctx.clipboardClearTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no pending clipboard clear", async () => {
    const ctx = createContext(null);

    await expect(
      ctx.useCase.execute({
        actionId: "clipboard-action-id",
        requireExpired: true,
      }),
    ).resolves.toEqual({
      cleared: false,
      reason: "noClipboardClearTask",
    });

    expect(ctx.clipboard.readText).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    expect(ctx.clipboardClearTasks.remove).not.toHaveBeenCalled();
  });

  it("does not clear before the clear delay expires", async () => {
    const ctx = createContext({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: 2_000,
    });

    await expect(
      ctx.useCase.execute({
        actionId: "clipboard-action-id",
        requireExpired: true,
      }),
    ).resolves.toEqual({
      cleared: false,
      reason: "notExpired",
    });

    expect(ctx.clipboard.readText).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    expect(ctx.clipboardClearTasks.remove).not.toHaveBeenCalled();
  });

  it("clears clipboard when copied entry was updated after copy", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSession = {
      ...ctx.ports.saved.unlockedVaultSession!,
      unlockedVault: {
        ...ctx.ports.saved.unlockedVaultSession!.unlockedVault,
        vault: {
          ...ctx.ports.saved.unlockedVaultSession!.unlockedVault.vault,
          entries: [
            {
              ...singlePasswordEntry,
              password: "new-password",
            },
          ],
        },
      },
    };

    await expect(
      ctx.useCase.execute({
        actionId: "clipboard-action-id",
        requireExpired: true,
      }),
    ).resolves.toEqual({
      cleared: true,
    });

    expect(ctx.clipboard.writeText).toHaveBeenCalledWith("");
    expect(ctx.clipboardClearTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("does not clear clipboard when user copied another value after password copy", async () => {
    const ctx = createContext();
    vi.mocked(ctx.clipboard.readText).mockResolvedValueOnce("other-value");

    await expect(
      ctx.useCase.execute({
        actionId: "clipboard-action-id",
        requireExpired: true,
      }),
    ).resolves.toEqual({
      cleared: false,
      reason: "clipboardChanged",
    });

    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    expect(ctx.clipboardClearTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("ignores stale clear action", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        actionId: "stale-action-id",
        requireExpired: true,
      }),
    ).resolves.toEqual({
      cleared: false,
      reason: "staleAction",
    });

    expect(ctx.clipboard.readText).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    expect(ctx.clipboardClearTasks.remove).not.toHaveBeenCalled();
  });
});
