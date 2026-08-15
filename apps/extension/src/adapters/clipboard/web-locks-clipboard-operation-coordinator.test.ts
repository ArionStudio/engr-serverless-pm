import {
  ClearClipboardTaskUseCase,
  CopyEntryPasswordUseCase,
  LockVaultUseCase,
  type ClipboardPort,
} from "@lfspm/core";
import {
  ClipboardClearService,
  VaultLifecycleCleanupService,
} from "@lfspm/core/services";
import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../../../../packages/core/src/__tests__/fixtures/ports";
import { createCoreTestValues } from "../../../../../packages/core/src/__tests__/fixtures/values";
import {
  saveUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../../../../packages/core/src/__tests__/fixtures/vault-entries";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import { ChromeClipboardClearTaskRepository } from "../storage/chrome-clipboard-clear-task.repository";
import {
  CLIPBOARD_OPERATION_LOCK_NAME,
  type WebLockManager,
  WebLocksClipboardOperationCoordinator,
} from "./web-locks-clipboard-operation-coordinator";
import { WebCryptoClipboardSecretHash } from "./web-crypto-clipboard-secret-hash";

class SerializedWebLockManager implements WebLockManager {
  readonly requestedNames: string[] = [];
  private tail: Promise<void> = Promise.resolve();

  request<T>(
    name: string,
    callback: (lock: Lock | null) => Promise<T>,
  ): Promise<T> {
    this.requestedNames.push(name);
    const previous = this.tail;
    let release = (): void => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    return previous.then(() => callback(null)).finally(release);
  }
}

function createDeferred() {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("WebLocksClipboardOperationCoordinator", () => {
  it("serializes independent adapter instances around shared task storage", async () => {
    const hashA = "a".repeat(64);
    const hashB = "b".repeat(64);
    const lockManager = new SerializedWebLockManager();
    const coordinatorA = new WebLocksClipboardOperationCoordinator(lockManager);
    const coordinatorB = new WebLocksClipboardOperationCoordinator(lockManager);
    const { storageArea } = createChromeStorageArea();
    const repository = new ChromeClipboardClearTaskRepository(storageArea);
    const firstStarted = createDeferred();
    const releaseFirst = createDeferred();
    let secondStarted = false;

    const firstOperation = coordinatorA.runExclusive(async () => {
      await repository.save({
        actionId: "action-a",
        copiedValueHash: hashA,
        expiresAt: 1_000,
      });
      firstStarted.resolve();
      await releaseFirst.promise;

      await expect(repository.get()).resolves.toEqual({
        actionId: "action-a",
        copiedValueHash: hashA,
        expiresAt: 1_000,
      });
    });

    await firstStarted.promise;

    const secondOperation = coordinatorB.runExclusive(async () => {
      secondStarted = true;
      await repository.save({
        actionId: "action-b",
        copiedValueHash: hashB,
        expiresAt: 2_000,
      });
    });

    expect(secondStarted).toBe(false);
    releaseFirst.resolve();
    await Promise.all([firstOperation, secondOperation]);

    expect(secondStarted).toBe(true);
    expect(lockManager.requestedNames).toEqual([
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
    ]);
    await expect(repository.get()).resolves.toEqual({
      actionId: "action-b",
      copiedValueHash: hashB,
      expiresAt: 2_000,
    });
  });

  it("returns values and preserves operation failures", async () => {
    const lockManager = new SerializedWebLockManager();
    const coordinator = new WebLocksClipboardOperationCoordinator(lockManager);
    const error = new Error("operation failed");

    await expect(coordinator.runExclusive(async () => "result")).resolves.toBe(
      "result",
    );
    await expect(
      coordinator.runExclusive(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it.each(["clear", "lock"] as const)(
    "serializes a real copy against an independent %s workflow",
    async (competingOperation) => {
      const values = createCoreTestValues();
      const ports = createCoreTestPorts(values);
      saveUnlockedVaultWithEntries(ports, values, [singlePasswordEntry]);
      vi.mocked(ports.ids.generateId).mockReset();
      vi.mocked(ports.ids.generateId).mockResolvedValue("clipboard-action-id");

      const lockManager = new SerializedWebLockManager();
      const copyCoordinator = new WebLocksClipboardOperationCoordinator(
        lockManager,
      );
      const clearCoordinator = new WebLocksClipboardOperationCoordinator(
        lockManager,
      );
      const lockCoordinator = new WebLocksClipboardOperationCoordinator(
        lockManager,
      );
      const { storageArea } = createChromeStorageArea();
      const repository = new ChromeClipboardClearTaskRepository(storageArea);
      const copyWriteStarted = createDeferred();
      const releaseCopyWrite = createDeferred();
      let clipboardValue = "";
      const clipboard: ClipboardPort = {
        readText: vi.fn(async () => clipboardValue),
        writeText: vi.fn(async (value) => {
          if (value !== "") {
            copyWriteStarted.resolve();
            await releaseCopyWrite.promise;
          }

          clipboardValue = value;
        }),
      };
      const clock = { now: vi.fn(() => 1_000) };
      const secretHash = new WebCryptoClipboardSecretHash();
      const clipboardClear = new ClipboardClearService(
        clipboard,
        repository,
        clock,
        secretHash,
      );
      const copy = new CopyEntryPasswordUseCase(
        clipboard,
        clipboardClear,
        copyCoordinator,
        secretHash,
        ports.ids,
        repository,
        ports.scheduledTasks,
        clock,
        ports.sessionServices.unlockedVaultSession,
      );
      const clear = new ClearClipboardTaskUseCase(
        clipboardClear,
        clearCoordinator,
      );
      const lock = new LockVaultUseCase(
        new VaultLifecycleCleanupService(
          clipboardClear,
          repository,
          lockCoordinator,
          ports.scheduledTasks,
          ports.vaultLockTasks,
          ports.sessionServices.unlockedVaultSession,
        ),
      );

      const copying = copy.execute({
        vaultId: values.vaultId,
        entryId: singlePasswordEntry.id,
        clearAfterMs: 60_000,
      });
      await copyWriteStarted.promise;
      const competing =
        competingOperation === "clear"
          ? clear.execute({
              actionId: "clipboard-action-id",
              requireExpired: false,
            })
          : lock.execute();

      expect(clipboard.readText).not.toHaveBeenCalled();
      expect(ports.saved.unlockedVaultSession).toBeDefined();

      releaseCopyWrite.resolve();
      await expect(copying).resolves.toEqual({ copied: true });

      if (competingOperation === "clear") {
        await expect(competing).resolves.toEqual({ cleared: true });
        expect(ports.saved.unlockedVaultSession).toBeDefined();
      } else {
        await expect(competing).resolves.toBeUndefined();
        expect(ports.saved.unlockedVaultSession).toBeUndefined();
        expect(ports.scheduledTasks.cancelTask).toHaveBeenCalledWith({
          name: "clearClipboard",
          actionId: "clipboard-action-id",
        });
      }

      expect(clipboardValue).toBe("");
      await expect(repository.get()).resolves.toBeNull();
      expect(lockManager.requestedNames).toEqual([
        CLIPBOARD_OPERATION_LOCK_NAME,
        CLIPBOARD_OPERATION_LOCK_NAME,
      ]);
    },
  );
});
