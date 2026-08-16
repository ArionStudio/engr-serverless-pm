import type {
  ClipboardClearTask,
  ClipboardClearTaskRepositoryPort,
} from "@lfspm/core";
import type { ChromeStorageArea } from "./chrome-storage-area";
import {
  decodeClipboardClearTaskRecord,
  encodeClipboardClearTaskRecord,
} from "../system/scheduled-task-record.codec";

export const CLIPBOARD_CLEAR_TASK_STORAGE_KEY = "clipboardClearTask";
export const CLIPBOARD_CLEAR_TASK_STORAGE_ACCESS_LEVEL = "TRUSTED_CONTEXTS";

export class ChromeClipboardClearTaskRepository implements ClipboardClearTaskRepositoryPort {
  private readonly storageArea: ChromeStorageArea;
  private readonly storageKey: string;
  private readonly accessRestriction: Promise<void>;

  constructor(
    storageArea: ChromeStorageArea = chrome.storage
      .session as ChromeStorageArea,
    storageKey = CLIPBOARD_CLEAR_TASK_STORAGE_KEY,
  ) {
    this.storageArea = storageArea;
    this.storageKey = storageKey;
    this.accessRestriction =
      storageArea.setAccessLevel?.({
        accessLevel: CLIPBOARD_CLEAR_TASK_STORAGE_ACCESS_LEVEL,
      }) ?? Promise.resolve();
  }

  async save(task: ClipboardClearTask): Promise<void> {
    await this.accessRestriction;
    await this.storageArea.set({
      [this.storageKey]: encodeClipboardClearTaskRecord(task),
    });
  }

  async get(): Promise<ClipboardClearTask | null> {
    await this.accessRestriction;
    const storedRecords = await this.storageArea.get(this.storageKey);
    const task = storedRecords[this.storageKey];

    if (task === undefined) {
      return null;
    }

    return decodeClipboardClearTaskRecord(task);
  }

  async remove(): Promise<void> {
    await this.accessRestriction;
    await this.storageArea.remove(this.storageKey);
  }
}
