import { describe, expect, it, vi } from "vitest";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import {
  ChromeClipboardClearTaskRepository,
  CLIPBOARD_CLEAR_TASK_STORAGE_ACCESS_LEVEL,
  CLIPBOARD_CLEAR_TASK_STORAGE_KEY,
} from "./chrome-clipboard-clear-task.repository";

const clipboardClearTask = {
  actionId: "clipboard-action-id",
  copiedValueHash: "a".repeat(64),
  expiresAt: 61_000,
};

describe("ChromeClipboardClearTaskRepository", () => {
  it("stores only volatile trusted-context ownership metadata", async () => {
    const { getRecords, storageArea } = createChromeStorageArea();
    const repository = new ChromeClipboardClearTaskRepository(storageArea);

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
    const repository = new ChromeClipboardClearTaskRepository(storageArea);

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
    const repository = new ChromeClipboardClearTaskRepository(storageArea);

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
    const repository = new ChromeClipboardClearTaskRepository(storageArea);

    await expect(repository.get()).rejects.toThrow(
      "Clipboard clear task metadata is malformed.",
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
  ])("rejects unusable clipboard ownership identities", async (storedTask) => {
    const { storageArea } = createChromeStorageArea({
      [CLIPBOARD_CLEAR_TASK_STORAGE_KEY]: storedTask,
    });
    const repository = new ChromeClipboardClearTaskRepository(storageArea);

    await expect(repository.get()).rejects.toThrow(
      "Clipboard clear task metadata is malformed.",
    );
  });

  it("removes clipboard ownership metadata", async () => {
    const { getRecords, storageArea } = createChromeStorageArea({
      [CLIPBOARD_CLEAR_TASK_STORAGE_KEY]: clipboardClearTask,
    });
    const repository = new ChromeClipboardClearTaskRepository(storageArea);

    await repository.remove();

    expect(getRecords()).not.toHaveProperty(CLIPBOARD_CLEAR_TASK_STORAGE_KEY);
  });

  it("preserves ownership metadata when removal fails", async () => {
    const error = new Error("session storage unavailable");
    const { getRecords, storageArea } = createChromeStorageArea({
      [CLIPBOARD_CLEAR_TASK_STORAGE_KEY]: clipboardClearTask,
    });
    const repository = new ChromeClipboardClearTaskRepository(storageArea);
    vi.spyOn(storageArea, "remove").mockRejectedValueOnce(error);

    await expect(repository.remove()).rejects.toBe(error);

    expect(getRecords()).toHaveProperty(CLIPBOARD_CLEAR_TASK_STORAGE_KEY);
  });
});
