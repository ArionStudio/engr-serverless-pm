import type {
  ClipboardClearTask,
  ClipboardClearTaskRepositoryPort,
} from "@lfspm/core";
import type { ChromeStorageArea } from "./chrome-storage-area";

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
      [this.storageKey]: {
        actionId: task.actionId,
        copiedValueHash: task.copiedValueHash,
        expiresAt: task.expiresAt,
      },
    });
  }

  async get(): Promise<ClipboardClearTask | null> {
    await this.accessRestriction;
    const storedRecords = await this.storageArea.get(this.storageKey);
    const task = storedRecords[this.storageKey];

    if (task === undefined) {
      return null;
    }

    if (!isClipboardClearTask(task)) {
      throw new Error("Clipboard clear task metadata is malformed.");
    }

    return {
      actionId: task.actionId,
      copiedValueHash: task.copiedValueHash,
      expiresAt: task.expiresAt,
    };
  }

  async remove(): Promise<void> {
    await this.accessRestriction;
    await this.storageArea.remove(this.storageKey);
  }
}

function isClipboardClearTask(value: unknown): value is ClipboardClearTask {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    isValidActionId(record.actionId) &&
    typeof record.copiedValueHash === "string" &&
    /^[0-9a-f]{64}$/.test(record.copiedValueHash) &&
    typeof record.expiresAt === "number" &&
    Number.isFinite(record.expiresAt)
  );
}

function isValidActionId(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}
