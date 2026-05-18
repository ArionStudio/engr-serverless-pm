import { describe, expect, it } from "vitest";
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import type { UnlockedVault } from "../../domain/vault/unlocked-vault";

const STORAGE_SESSION_LIMIT_BYTES = 10 * 1024 * 1024;
const SESSION_HEADROOM_BYTES = 1024 * 1024;
const SESSION_ENTRY_BUDGET_BYTES =
  STORAGE_SESSION_LIMIT_BYTES - SESSION_HEADROOM_BYTES;
const MAX_TAGS_PER_ENTRY = 10;
const MAX_VAULT_TAGS = 250;
const REGISTERED_DEVICES_FOR_BUDGET = 20;
const MIN_SUPPORTED_WORST_CASE_ENTRIES = 5000;

const textEncoder = new TextEncoder();

function createMaxSizeEntry(index: number): PasswordEntry {
  return {
    id: `entry-${index}`.padEnd(128, "x"),
    password: "p".repeat(512),
    login: "l".repeat(128),
    tags: Array.from(
      { length: MAX_TAGS_PER_ENTRY },
      (_value, tagIndex) => tagIndex + index,
    ),
    sanitizedUrl: `https://${"u".repeat(503)}`,
  };
}

function createUnlockedVault(entries: PasswordEntry[]): UnlockedVault {
  return {
    vaultId: "vault-id",
    deviceId: "device-id",
    vault: {
      entries,
      registeredDevices: Array.from(
        { length: REGISTERED_DEVICES_FOR_BUDGET },
        (_value, index) => ({
          id: `device-${index}`.padEnd(128, "x"),
          name: `device-${index}`.padEnd(64, "x"),
          createdAt: new Date(1_700_000_000_000),
          publicKeys: {
            signingKey: new ArrayBuffer(32),
          },
        }),
      ),
      tags: Array.from({ length: MAX_VAULT_TAGS }, (_value, index) => ({
        id: index,
        name: `tag-${index}`.padEnd(32, "x"),
      })),
    },
    vaultMasterKey: new ArrayBuffer(32),
    devicePrivateSignKey: new ArrayBuffer(64),
  } as UnlockedVault;
}

function estimateSessionBytes(value: unknown): number {
  return textEncoder.encode(
    JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (nestedValue instanceof ArrayBuffer) {
        return {
          byteLength: nestedValue.byteLength,
        };
      }

      return nestedValue;
    }),
  ).byteLength;
}

function estimateSessionBytesForEntryCount(entryCount: number): number {
  return estimateSessionBytes(
    createUnlockedVault(
      Array.from({ length: entryCount }, (_value, index) =>
        createMaxSizeEntry(index),
      ),
    ),
  );
}

function findMaxEntryCountWithinBudget(): number {
  let lowestPassingCount = 0;
  let highestFailingCount = 1;

  while (
    estimateSessionBytesForEntryCount(highestFailingCount) <=
    SESSION_ENTRY_BUDGET_BYTES
  ) {
    lowestPassingCount = highestFailingCount;
    highestFailingCount *= 2;
  }

  while (highestFailingCount - lowestPassingCount > 1) {
    const candidateCount = Math.floor(
      (lowestPassingCount + highestFailingCount) / 2,
    );

    if (
      estimateSessionBytesForEntryCount(candidateCount) <=
      SESSION_ENTRY_BUDGET_BYTES
    ) {
      lowestPassingCount = candidateCount;
    } else {
      highestFailingCount = candidateCount;
    }
  }

  return lowestPassingCount;
}

describe("AddEntryUseCase session budget", () => {
  it("keeps the minimum supported worst-case password entry count under the 10MB session limit with headroom", () => {
    const sessionBytes = estimateSessionBytesForEntryCount(
      MIN_SUPPORTED_WORST_CASE_ENTRIES,
    );

    expect(sessionBytes).toBeLessThanOrEqual(SESSION_ENTRY_BUDGET_BYTES);
  });

  it("keeps worst-case session capacity above the supported entry count", () => {
    const maxEntryCount = findMaxEntryCountWithinBudget();

    expect(maxEntryCount).toBeGreaterThanOrEqual(
      MIN_SUPPORTED_WORST_CASE_ENTRIES,
    );
  });
});
