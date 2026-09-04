import { vi } from "vitest";
import type { ChromeStorageArea } from "../../adapters/storage/chrome-storage-area.type";

export function createChromeStorageArea(
  initialRecords: Record<string, unknown> = {},
) {
  let records = { ...initialRecords };
  const storageArea: ChromeStorageArea = {
    setAccessLevel: vi.fn(async () => undefined),
    async get(keys?: unknown) {
      if (typeof keys === "string") {
        return { [keys]: records[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, records[key]]));
      }

      return { ...records };
    },
    async set(items: Record<string, unknown>) {
      records = {
        ...records,
        ...items,
      };
    },
    async remove(keys: string | string[]) {
      const keysToRemove = new Set(Array.isArray(keys) ? keys : [keys]);
      records = Object.fromEntries(
        Object.entries(records).filter(
          ([recordKey]) => !keysToRemove.has(recordKey),
        ),
      );
    },
  };

  return {
    getRecords: () => records,
    storageArea,
  };
}
