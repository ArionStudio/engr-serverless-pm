import { describe, expect, it, vi } from "vitest";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import { InvalidScheduledTaskRecordError } from "../system";
import {
  ChromeClipboardClearTaskRepositoryAdapter,
  CLIPBOARD_CLEAR_TASK_STORAGE_ACCESS_LEVEL,
  CLIPBOARD_CLEAR_TASK_STORAGE_KEY,
} from "./chrome-clipboard-clear-task-repository.adapter";

const clipboardClearTask = {
  actionId: "clipboard-action-id",
  copiedValueHash: "a".repeat(64),
  expiresAt: 61_000,
};

describe("ChromeClipboardClearTaskRepositoryAdapter", () => {
  it("observes access restriction rejection immediately and preserves it for callers", async () => {
    const accessError = new Error("access restriction unavailable");
    const { getRecords, storageArea } = createChromeStorageArea();
    vi.mocked(storageArea.setAccessLevel!).mockRejectedValueOnce(accessError);
    const setStoredRecords = vi.spyOn(storageArea, "set");
    const repository = new ChromeClipboardClearTaskRepositoryAdapter(
      storageArea,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(repository.save(clipboardClearTask)).rejects.toBe(accessError);
    expect(setStoredRecords).not.toHaveBeenCalled();
    expect(getRecords()).toEqual({});
  });

  it("stores only volatile trusted-context ownership metadata", async () => {
    const { getRecords, storageArea } = createChromeStorageArea();
    const repository = new ChromeClipboardClearTaskRepositoryAdapter(
      storageArea,
    );

    await repository.save(clipboardClearTask);

    expect(getRecords()[CLIPBOARD_CLEAR_TASK_STORAGE_KEY]).toEqual(
      clipboardClearTask,
    );
    expect(storageArea.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: CLIPBOARD_CLEAR_TASK_STORAGE_ACCESS_LEVEL,
    });
  });

  it("retrieves and replaces the current clipboard ownership task", async () => {
    const { storageArea } = createChromeStorageArea();
    const repository = new ChromeClipboardClearTaskRepositoryAdapter(
      storageArea,
    );

    await repository.save(clipboardClearTask);
    await repository.save({
      actionId: "replacement-action-id",
      copiedValueHash: "b".repeat(64),
      expiresAt: 62_000,
    });

    await expect(repository.get()).resolves.toEqual({
      actionId: "replacement-action-id",
      copiedValueHash: "b".repeat(64),
      expiresAt: 62_000,
    });
  });

  it("returns null when clipboard ownership metadata is missing", async () => {
    const { storageArea } = createChromeStorageArea();
    const repository = new ChromeClipboardClearTaskRepositoryAdapter(
      storageArea,
    );

    await expect(repository.get()).resolves.toBeNull();
  });

  it("rejects malformed clipboard ownership metadata", async () => {
    const { storageArea } = createChromeStorageArea({
      [CLIPBOARD_CLEAR_TASK_STORAGE_KEY]: {
        actionId: "clipboard-action-id",
        copiedValueHash: "a".repeat(64),
        expiresAt: "tomorrow",
      },
    });
    const repository = new ChromeClipboardClearTaskRepositoryAdapter(
      storageArea,
    );

    await expect(repository.get()).rejects.toBeInstanceOf(
      InvalidScheduledTaskRecordError,
    );
  });

  it.each([
    {
      actionId: "",
      copiedValueHash: "a".repeat(64),
      expiresAt: 61_000,
    },
    {
      actionId: "clipboard-action-id",
      copiedValueHash: "not-a-sha-256-digest",
      expiresAt: 61_000,
    },
    {
      actionId: "clipboard-action-id",
      copiedValueHash: "A".repeat(64),
      expiresAt: 61_000,
    },
    {
      actionId: "\uD800",
      copiedValueHash: "a".repeat(64),
      expiresAt: 61_000,
    },
    {
      actionId: "clipboard-action-id",
      copiedValueHash: "a".repeat(64),
      expiresAt: -1,
    },
    {
      actionId: "clipboard-action-id",
      copiedValueHash: "a".repeat(64),
      expiresAt: 1.5,
    },
    {
      actionId: "clipboard-action-id",
      copiedValueHash: "a".repeat(64),
      expiresAt: Number.NaN,
    },
    {
      actionId: "clipboard-action-id",
      copiedValueHash: "a".repeat(64),
      expiresAt: Number.MAX_SAFE_INTEGER + 1,
    },
    {
      ...clipboardClearTask,
      futureField: true,
    },
  ])("rejects unusable clipboard ownership identities", async (storedTask) => {
    const { storageArea } = createChromeStorageArea({
      [CLIPBOARD_CLEAR_TASK_STORAGE_KEY]: storedTask,
    });
    const repository = new ChromeClipboardClearTaskRepositoryAdapter(
      storageArea,
    );

    await expect(repository.get()).rejects.toBeInstanceOf(
      InvalidScheduledTaskRecordError,
    );
  });

  it("removes clipboard ownership metadata", async () => {
    const { getRecords, storageArea } = createChromeStorageArea({
      [CLIPBOARD_CLEAR_TASK_STORAGE_KEY]: clipboardClearTask,
    });
    const repository = new ChromeClipboardClearTaskRepositoryAdapter(
      storageArea,
    );

    await repository.remove();

    expect(getRecords()).not.toHaveProperty(CLIPBOARD_CLEAR_TASK_STORAGE_KEY);
  });

  it("preserves ownership metadata when removal fails", async () => {
    const error = new Error("session storage unavailable");
    const { getRecords, storageArea } = createChromeStorageArea({
      [CLIPBOARD_CLEAR_TASK_STORAGE_KEY]: clipboardClearTask,
    });
    const repository = new ChromeClipboardClearTaskRepositoryAdapter(
      storageArea,
    );
    vi.spyOn(storageArea, "remove").mockRejectedValueOnce(error);

    await expect(repository.remove()).rejects.toBe(error);

    expect(getRecords()).toHaveProperty(CLIPBOARD_CLEAR_TASK_STORAGE_KEY);
  });
});
