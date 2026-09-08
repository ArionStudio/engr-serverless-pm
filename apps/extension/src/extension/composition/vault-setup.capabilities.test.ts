// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useVaultSetup } from "@/ui/features/vault-setup/use-vault-setup";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import { composeVaultSetup } from "./vault-setup.capabilities";
import type { SetupRecovery } from "@/ui/features/vault-setup/setup.type";

const fake = vi.hoisted(() => ({ get: vi.fn(), enroll: vi.fn() }));
vi.mock("./device-management.capabilities", () => ({
  completeDeviceEnrollment: fake.enroll,
}));
vi.mock("./first-launch.capabilities", () => ({ getApplication: fake.get }));
const words = Array.from({ length: 24 }, (_, i) => `word${i}`);
let vaults: { vaultId: string; displayName: string }[];
let unlocked: boolean;
let activeVaultId: string;
let storage: ReturnType<typeof createChromeStorageArea>;
let initialize: ReturnType<typeof vi.fn>;
let replace: ReturnType<typeof vi.fn>;
let copy: ReturnType<typeof vi.fn>;
let recover: ReturnType<typeof vi.fn>;
let unlock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fake.enroll.mockReset();
  vaults = [];
  unlocked = false;
  activeVaultId = "vault";
  storage = createChromeStorageArea();
  const queues = new Map<string, Promise<unknown>>();
  vi.stubGlobal("navigator", {
    locks: {
      request: (key: string, operation: () => Promise<unknown>) => {
        const next = (queues.get(key) ?? Promise.resolve()).then(operation);
        queues.set(
          key,
          next.catch(() => undefined),
        );
        return next;
      },
    },
  });
  vi.stubGlobal("chrome", {
    storage: {
      local: storage.storageArea,
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
  initialize = vi.fn(async () => {
    vaults = [{ vaultId: "vault", displayName: "Test vault" }];
    unlocked = true;
    return {
      vaultDisplayName: "Test vault",
      recoveryMnemonicKey: { format: "BIP39", words },
    };
  });
  replace = vi.fn(async () => ({
    recoveryMnemonicKey: { format: "BIP39", words },
  }));
  copy = vi.fn(async () => {});
  recover = vi.fn(async () => ({
    recoveryMnemonicKey: { format: "BIP39", words },
  }));
  unlock = vi.fn(async () => {
    unlocked = true;
  });
  fake.get.mockResolvedValue({
    listLocalVaults: { execute: async () => ({ vaults }) },
    getVaultSessionStatus: {
      execute: async () =>
        unlocked
          ? { status: "unlocked", vaultId: activeVaultId }
          : { status: "locked" },
    },
    initializeVault: { execute: initialize },
    replaceRecoveryWords: { execute: replace },
    recoverDeviceAccess: { execute: recover },
    unlockVault: { execute: unlock },
    lockVault: {
      execute: async () => {
        unlocked = false;
      },
    },
    copyRecoveryWords: { execute: copy },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const createParams = {
  password: "private password",
  deviceName: "Laptop",
  duration: 600_000,
};
const answers = (recovery: SetupRecovery) =>
  Object.fromEntries(
    recovery.positions.map((position) => [
      position,
      recovery.words[position - 1],
    ]),
  );
describe("vault setup orchestration", () => {
  it("requires explicit replacement of saved words and a new verification receipt", async () => {
    const capabilities = composeVaultSetup();
    const initial = await capabilities.create(createParams);
    await capabilities.verify(answers(initial));
    await expect(capabilities.replace("vault")).rejects.toThrow(
      "already complete",
    );
    const replacement = await capabilities.replace(
      "vault",
      "recovery-replacement",
    );
    expect(replacement.purpose).toBe("recovery-replacement");
    expect(replacement.positions).toHaveLength(3);
    expect((await capabilities.inspect()).vault?.complete).toBe(false);
    expect(await capabilities.verify({})).toBe(false);
    expect(await capabilities.verify(answers(replacement))).toBe(true);
    expect((await capabilities.inspect()).vault?.complete).toBe(true);
  });

  it("restores completed setup when replacement fails before changing recovery records", async () => {
    const capabilities = composeVaultSetup();
    const initial = await capabilities.create(createParams);
    await capabilities.verify(answers(initial));
    const original = storage.getRecords()["vault-setup:vault"];
    replace.mockRejectedValueOnce(new Error("Recovery records unavailable"));
    await expect(
      capabilities.replace("vault", "recovery-replacement"),
    ).rejects.toThrow("Recovery records unavailable");
    expect(storage.getRecords()["vault-setup:vault"]).toEqual(original);
    expect((await capabilities.inspect()).vault).toMatchObject({
      complete: true,
      unlocked: true,
    });
  });

  it("uses the active vault and retains explicit locked selection without falling back when it disappears", async () => {
    vaults = [
      { vaultId: "first", displayName: "First" },
      { vaultId: "second", displayName: "Second" },
    ];
    const setup = composeVaultSetup();
    expect((await setup.inspect()).vault).toBeNull();
    expect((await setup.inspect("second")).vault?.vaultId).toBe("second");
    activeVaultId = "second";
    unlocked = true;
    expect((await setup.inspect("first")).vault).toMatchObject({
      vaultId: "second",
      unlocked: true,
    });
    await setup.saveDuration("second", 60_000);
    expect(storage.getRecords()["vault-setup:second"]).toMatchObject({
      duration: 60_000,
    });
    expect(storage.getRecords()["vault-setup:first"]).toBeUndefined();
    unlocked = false;
    expect((await setup.inspect("second")).vault).toMatchObject({
      vaultId: "second",
      unlocked: false,
    });
    vaults = vaults.slice(0, 1);
    expect((await setup.inspect("second")).vault).toBeNull();
    await expect(setup.saveDuration("second", 120_000)).rejects.toThrow();
    expect(storage.getRecords()["vault-setup:first"]).toBeUndefined();
    unlocked = true;
    await expect(setup.inspect()).rejects.toThrow(
      "Active vault is unavailable",
    );
  });
  it("refuses first-vault creation when multiple locked vaults need a selection", async () => {
    vaults = [
      { vaultId: "first", displayName: "First" },
      { vaultId: "second", displayName: "Second" },
    ];
    await expect(composeVaultSetup().create(createParams)).rejects.toThrow(
      "A local vault already exists",
    );
    expect(initialize).not.toHaveBeenCalled();
  });
  it("serializes competing setup tabs, persists no words/password, and verifies three distinct positions", async () => {
    const first = composeVaultSetup(),
      second = composeVaultSetup();
    const results = await Promise.allSettled([
      first.create(createParams),
      second.create(createParams),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(initialize).toHaveBeenCalledTimes(1);
    const result = results[0];
    if (result.status !== "fulfilled") throw new Error("Expected creation");
    expect(new Set(result.value.positions).size).toBe(3);
    expect(
      result.value.positions.every(
        (position) => position >= 1 && position <= 24,
      ),
    ).toBe(true);
    expect(JSON.stringify(storage.getRecords())).not.toContain(
      "private password",
    );
    expect(JSON.stringify(storage.getRecords())).not.toContain("word0");
    expect(await first.verify({})).toBe(false);
    expect((await first.inspect()).vault?.complete).toBe(false);
    expect(await first.verify(answers(result.value))).toBe(true);
    expect((await first.inspect()).vault?.complete).toBe(true);
    await expect(first.save("copy")).rejects.toThrow();
  });
  it("requires unlocking after interruption and invalidates another tab's older recovery attempt", async () => {
    const first = composeVaultSetup();
    const original = await first.create(createParams);
    await first.lock();
    const resumed = composeVaultSetup();
    await expect(resumed.replace("vault")).rejects.toThrow();
    await resumed.unlock("vault", "private password");
    const next = await resumed.replace("vault");
    await expect(first.verify(answers(original))).rejects.toThrow();
    const other = composeVaultSetup();
    await other.replace("vault");
    await expect(resumed.verify(answers(next))).rejects.toThrow();
  });
  it("reconciles a committed vault after failed initialization and refuses duplicate creation", async () => {
    initialize.mockImplementationOnce(async () => {
      vaults = [{ vaultId: "vault", displayName: "Saved vault" }];
      throw new Error("Activation response failed");
    });
    const setup = composeVaultSetup();
    await expect(setup.create(createParams)).rejects.toThrow();
    expect((await setup.inspect()).vault?.complete).toBe(false);
    await expect(setup.create(createParams)).rejects.toThrow();
    expect(initialize).toHaveBeenCalledTimes(1);
  });
  it("limits print output to the recovery record and removes secret DOM after a print failure", async () => {
    const setup = composeVaultSetup();
    const recovery = await setup.create(createParams);
    let printed = "";
    const append = document.body.append.bind(document.body);
    vi.spyOn(document.body, "append").mockImplementation(
      (...nodes: (Node | string)[]) => {
        append(...nodes);
        for (const node of nodes) {
          if (node instanceof HTMLIFrameElement && node.contentWindow) {
            vi.spyOn(node.contentWindow, "focus").mockImplementation(() => {});
            vi.spyOn(node.contentWindow, "print").mockImplementation(() => {
              printed = node.contentDocument?.body.textContent ?? "";
              throw new Error("Printing unavailable");
            });
          }
        }
      },
    );
    await expect(setup.save("print")).rejects.toThrow("Printing unavailable");
    expect(printed).toContain("24. " + recovery.words[23]);
    expect(printed).toContain(
      "Words alone cannot restore deleted browser data",
    );
    expect(printed).not.toContain(createParams.password);
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.body.textContent).not.toContain(recovery.words[0]);
    expect((await setup.inspect()).vault?.complete).toBe(false);
  });

  it("does not replace recovery after a queued verification has completed", async () => {
    const first = composeVaultSetup(),
      second = composeVaultSetup();
    const recovery = await first.create(createParams);
    const verifying = first.verify(answers(recovery));
    const replacing = second.replace("vault");
    expect(await verifying).toBe(true);
    await expect(replacing).rejects.toThrow(
      "Recovery setup is already complete",
    );
    expect(replace).not.toHaveBeenCalled();
    expect((await first.inspect()).vault?.complete).toBe(true);
  });

  it("serializes duration updates so they cannot overwrite a newer recovery receipt", async () => {
    const first = composeVaultSetup(),
      second = composeVaultSetup();
    await first.create(createParams);
    const originalGet = storage.storageArea.get.bind(storage.storageArea);
    let release = () => {};
    let entered = () => {};
    const paused = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let reads = 0;
    vi.spyOn(storage.storageArea, "get").mockImplementation(async (keys) => {
      const result = await originalGet(keys);
      if (++reads === 2) {
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return result;
    });
    const saving = first.saveDuration("vault", 60_000);
    await paused;
    const replacing = second.replace("vault");
    // All repository doubles settle through microtasks; let queued operations drain.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(replace).not.toHaveBeenCalled();
    release();
    await saving;
    const current = await replacing;
    expect(storage.getRecords()["vault-setup:vault"]).toMatchObject({
      duration: 60_000,
      complete: false,
    });
    expect(await second.verify(answers(current))).toBe(true);
  });

  it("uses a supported default for a damaged stored duration without discarding the recovery receipt", async () => {
    vaults = [{ vaultId: "vault", displayName: "Saved vault" }];
    await storage.storageArea.set({
      "vault-setup:vault": {
        duration: 120_000,
        deviceName: "Laptop",
        complete: true,
        token: "receipt",
      },
    });
    const setup = composeVaultSetup();
    expect((await setup.inspect()).vault).toMatchObject({
      duration: 600_000,
      deviceName: "Laptop",
      complete: true,
    });
    expect(await setup.unlock("vault", "private password")).toMatchObject({
      duration: 600_000,
      complete: true,
      unlocked: true,
    });
    expect(storage.getRecords()["vault-setup:vault"]).toMatchObject({
      token: "receipt",
      complete: true,
    });
    await expect(setup.saveDuration("vault", 120_000)).rejects.toThrow(
      "Invalid lock duration",
    );
  });

  it("keeps ordinary preference saves soft but invalidates changed recovery receipts", async () => {
    const setup = composeVaultSetup();
    const initial = await setup.create(createParams);
    await setup.verify(answers(initial));
    const receipt = storage.getRecords()["vault-setup:vault"];
    const changed = vi.fn();
    const unsubscribe = setup.subscribe(changed);
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock
      .calls[0][0];
    listener(
      { "vault-setup:vault": { oldValue: receipt, newValue: receipt } },
      "local",
    );
    expect(changed).toHaveBeenLastCalledWith(false);
    listener(
      {
        "vault-setup:vault": {
          oldValue: receipt,
          newValue: { token: "replacement-receipt", complete: false },
        },
      },
      "local",
    );
    expect(changed).toHaveBeenLastCalledWith(true);
    unsubscribe();
  });

  it("ignores another vault's preference changes while holding recovery words", async () => {
    const setup = composeVaultSetup();
    const changed = vi.fn();
    const unsubscribe = setup.subscribe(changed);
    await setup.create(createParams);
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock
      .calls[0][0];
    listener(
      { "vault-setup:other": { newValue: { token: "other-receipt" } } },
      "local",
    );
    expect(changed).not.toHaveBeenCalled();
    await expect(setup.save("copy")).resolves.toBeUndefined();
    listener(
      { "vault-setup:vault": { newValue: { token: "replacement-receipt" } } },
      "local",
    );
    expect(changed).toHaveBeenCalledTimes(1);
    await expect(setup.save("copy")).rejects.toThrow("Recovery session ended");
    unsubscribe();
  });

  it("serializes recovery export with replacement in another tab", async () => {
    const first = composeVaultSetup(),
      second = composeVaultSetup();
    await first.create(createParams);
    let release = () => {};
    let entered = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    copy.mockImplementation(async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const saving = first.save("copy");
    await started;
    const replacing = second.replace("vault");
    await second.inspect();
    expect(replace).not.toHaveBeenCalled();
    release();
    await saving;
    await replacing;
    await expect(first.save("copy")).rejects.toThrow("Recovery session ended");
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it("discovers activation from another context and refreshes a phrase-free page on focus", () => {
    const setup = composeVaultSetup();
    const changed = vi.fn();
    const unsubscribe = setup.subscribe(changed);
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock
      .calls[0][0];
    listener(
      {
        unlockedVaultSessionMaterial: {
          newValue: { sessionId: "other", vaultId: "vault" },
        },
      },
      "session",
    );
    expect(changed).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("focus"));
    expect(changed).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("keeps its own recovery result through initialization and delayed activation events", async () => {
    const setup = composeVaultSetup();
    const changed = vi.fn();
    const unsubscribe = setup.subscribe(changed);
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock
      .calls[0][0];
    const activate = () =>
      listener(
        {
          unlockedVaultSessionMaterial: {
            newValue: { sessionId: "own", vaultId: "vault" },
          },
        },
        "session",
      );
    initialize.mockImplementationOnce(async () => {
      activate();
      window.dispatchEvent(new Event("focus"));
      vaults = [{ vaultId: "vault", displayName: "Test vault" }];
      unlocked = true;
      return {
        vaultDisplayName: "Test vault",
        recoveryMnemonicKey: { format: "BIP39", words },
      };
    });
    const recovery = await setup.create(createParams);
    activate();
    expect(changed).not.toHaveBeenCalled();
    expect(await setup.verify(answers(recovery))).toBe(true);
    unsubscribe();
  });

  it("clears recovery when the background locks the session", async () => {
    vi.useFakeTimers();
    const setup = composeVaultSetup();
    const changed = vi.fn();
    const unsubscribe = setup.subscribe(changed);
    await setup.create(createParams);
    unlocked = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).toHaveBeenCalledTimes(1);
    await expect(setup.save("copy")).rejects.toThrow();
    unsubscribe();
  });
});

describe("password recovery orchestration", () => {
  async function existing() {
    const setup = composeVaultSetup();
    const first = await setup.create(createParams);
    await setup.verify(answers(first));
    await setup.lock();
    return setup;
  }
  it("preserves a queued recovery result when the window regains focus", async () => {
    const setup = await existing();
    const { result } = renderHook(() => useVaultSetup(setup));
    await waitFor(() => expect(result.current.vault?.complete).toBe(true));
    let release = () => {};
    let held = false;
    const blocker = navigator.locks.request(
      "lfspm:first-vault-setup",
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
          held = true;
        }),
    );
    await waitFor(() => expect(held).toBe(true));
    let operation: Promise<void> | undefined;
    act(() => {
      operation = result.current.recover(words, "new private password");
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(recover).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await blocker;
      await operation;
    });
    expect(result.current.recovery).toMatchObject({
      purpose: "password-recovery",
      words,
      vault: { unlocked: true, complete: false },
    });
  });
  it.each([
    ["LocalVaultTrustCheckpointNotFoundError", "recovery data is missing"],
    ["DeviceAccessRecoveryBackupMismatchError", "could not be verified"],
    ["InvalidLocalVaultSecurityRecordError", "could not be verified"],
    ["DeviceAccessMaterialChangedError", "access records changed"],
    ["UnsupportedAlgorithmSuiteError", "encryption format"],
    ["UnexpectedStorageError", "recovery words or saved local data"],
  ])("explains the local recovery failure %s", async (name, guidance) => {
    const setup = await existing();
    const { result } = renderHook(() => useVaultSetup(setup));
    await waitFor(() => expect(result.current.vault?.complete).toBe(true));
    const error = new Error("Local trust checkpoint is missing");
    error.name = name;
    recover.mockRejectedValueOnce(error);
    await act(async () => {
      await result.current.recover(words, "new private password");
    });
    expect(result.current.error).toContain(guidance);
    expect(result.current.vault?.complete).toBe(true);
    expect(unlock).not.toHaveBeenCalled();
  });
  it("serializes a competing unlock before recovery can rotate its access records", async () => {
    const setup = await existing();
    let release = () => {};
    unlock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      unlocked = true;
    });
    const unlocking = setup.unlock("vault", "old password");
    await waitFor(() => expect(unlock).toHaveBeenCalledTimes(1));
    const recovering = composeVaultSetup()
      .recover("vault", words, "new private password")
      .catch((cause: unknown) => cause);
    // Let the other document's operation reach the shared browser lock.
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await unlocking;
    expect(await recovering).toMatchObject({
      message: "Select a locked vault to recover",
    });
    expect(recover).not.toHaveBeenCalled();
    expect((await setup.inspect()).vault).toMatchObject({
      complete: true,
      unlocked: true,
    });
  });
  it("locks immediately and also closes a session activated by pending recovery", async () => {
    const setup = await existing();
    const app = await fake.get();
    const lock = vi.spyOn(app.lockVault, "execute");
    let release = () => {};
    let recovering = false;
    recover.mockImplementationOnce(async () => {
      recovering = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { recoveryMnemonicKey: { format: "BIP39", words } };
    });
    const recovery = setup.recover("vault", words, "new private password");
    await waitFor(() => expect(recovering).toBe(true));
    const locking = composeVaultSetup().lock();
    await waitFor(() => expect(lock).toHaveBeenCalledTimes(1));
    expect(unlocked).toBe(false);
    release();
    await recovery;
    await locking;
    expect(lock).toHaveBeenCalledTimes(2);
    expect(unlocked).toBe(false);
    await expect(setup.save("copy")).rejects.toThrow("Recovery session ended");
    expect(copy).not.toHaveBeenCalled();
  });
  it("marks recovery unfinished before the atomic password change and verifies replacement words", async () => {
    const setup = await existing();
    const original = storage.getRecords()["vault-setup:vault"];
    recover.mockImplementationOnce(async () => {
      expect(storage.getRecords()["vault-setup:vault"]).toMatchObject({
        complete: false,
      });
      return { recoveryMnemonicKey: { format: "BIP39", words } };
    });
    const result = await setup.recover("vault", words, "new private password");
    expect(recover).toHaveBeenCalledWith({
      vaultId: "vault",
      recoveryMnemonicKey: { format: "BIP39", words },
      newMasterPassword: "new private password",
    });
    expect(unlock).toHaveBeenCalledWith({
      vaultId: "vault",
      masterPassword: "new private password",
      lockAfterMs: 600_000,
    });
    expect(result).toMatchObject({
      purpose: "password-recovery",
      vault: { complete: false, unlocked: true, deviceName: "Laptop" },
    });
    expect(storage.getRecords()["vault-setup:vault"]).not.toEqual(original);
    expect(JSON.stringify(storage.getRecords())).not.toMatch(
      /word0|new private password/,
    );
    expect(new Set(result.positions).size).toBe(3);
    expect(await setup.verify(answers(result))).toBe(true);
    expect((await setup.inspect()).vault?.complete).toBe(true);
    expect(initialize).toHaveBeenCalledTimes(1);
  });
  it("restores completion after rejected recovery without unlocking or replacing words", async () => {
    const setup = await existing();
    const original = storage.getRecords()["vault-setup:vault"];
    recover.mockRejectedValueOnce(new Error("Invalid recovery words"));
    await expect(
      setup.recover("vault", words, "new private password"),
    ).rejects.toThrow("Invalid recovery words");
    expect(storage.getRecords()["vault-setup:vault"]).toEqual(original);
    expect(unlock).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect((await setup.inspect()).vault?.unlocked).toBe(false);
  });
  it("does not change the password when the unfinished state cannot be persisted", async () => {
    const setup = await existing();
    vi.spyOn(storage.storageArea, "set").mockRejectedValueOnce(
      new Error("Storage unavailable"),
    );
    await expect(
      setup.recover("vault", words, "new private password"),
    ).rejects.toThrow("Storage unavailable");
    expect(recover).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect((await setup.inspect()).vault?.complete).toBe(true);
  });
  it("does not attach recovered words to a different session that replaced activation", async () => {
    const setup = await existing();
    vaults.push({ vaultId: "other", displayName: "Other vault" });
    unlock.mockImplementationOnce(async () => {
      unlocked = true;
      activeVaultId = "other";
    });
    await expect(
      setup.recover("vault", words, "new private password"),
    ).rejects.toMatchObject({ name: "PasswordRecoveryCompletionError" });
    expect(storage.getRecords()["vault-setup:vault"]).toMatchObject({
      complete: false,
    });
    await expect(setup.save("copy")).rejects.toThrow("Recovery session ended");
    expect(copy).not.toHaveBeenCalled();
  });
  it("keeps the unfinished state after a changed password cannot activate and permits resuming", async () => {
    const setup = await existing();
    unlock.mockRejectedValueOnce(new Error("Activation failed"));
    await expect(
      setup.recover("vault", words, "new private password"),
    ).rejects.toMatchObject({ name: "PasswordRecoveryCompletionError" });
    expect((await setup.inspect()).vault).toMatchObject({
      complete: false,
      unlocked: false,
    });
    const resumed = composeVaultSetup();
    await resumed.unlock("vault", "new private password");
    const replacement = await resumed.replace("vault");
    expect(await resumed.verify(answers(replacement))).toBe(true);
  });
});

describe("enrollment recovery receipts", () => {
  const params = {
    approval: "fixture-approval",
    password: "fixture-password",
    deviceName: "Laptop",
    duration: 600_000,
  };
  it.each([false, true])(
    "preserves enrollment recovery when later inspection is unavailable: %s",
    async (inspectionFails) => {
      await storage.storageArea.set({
        "vault-setup:vault": {
          duration: 600_000,
          deviceName: "Old browser",
          complete: true,
          token: "old-receipt",
        },
      });
      fake.enroll.mockImplementationOnce(
        async (
          _params: unknown,
          beforeActivation: (vaultId: string) => Promise<void>,
        ) => {
          await beforeActivation("vault");
          expect(storage.getRecords()["vault-setup:vault"]).toMatchObject({
            complete: false,
            deviceName: "Laptop",
          });
          vaults = [{ vaultId: "vault", displayName: "Enrolled vault" }];
          unlocked = true;
          if (inspectionFails)
            fake.get.mockRejectedValueOnce(new Error("Refresh unavailable"));
          return {
            vaultId: "vault",
            name: "Enrolled vault",
            words,
            syncUpload: "pending",
          };
        },
      );
      const setup = composeVaultSetup();
      const result = await setup.enroll(params);
      expect(result.syncUpload).toBe("pending");
      expect(result.vault.complete).toBe(false);
      expect(result.words).toEqual(words);
      if (inspectionFails)
        await expect(setup.inspect()).rejects.toThrow("Refresh unavailable");
      expect(await setup.verify(answers(result))).toBe(true);
      expect((await setup.inspect()).vault?.complete).toBe(true);
    },
  );
  it("does not activate when an unfinished receipt cannot be persisted", async () => {
    const activate = vi.fn();
    fake.enroll.mockImplementationOnce(
      async (
        _params: unknown,
        beforeActivation: (vaultId: string) => Promise<void>,
      ) => {
        await beforeActivation("vault");
        activate();
      },
    );
    vi.spyOn(storage.storageArea, "set").mockRejectedValueOnce(
      new Error("Storage unavailable"),
    );
    await expect(composeVaultSetup().enroll(params)).rejects.toThrow(
      "Storage unavailable",
    );
    expect(activate).not.toHaveBeenCalled();
  });
  it("resumes incomplete recovery after activation was saved but completion was interrupted", async () => {
    fake.enroll.mockImplementationOnce(
      async (
        _params: unknown,
        beforeActivation: (vaultId: string) => Promise<void>,
      ) => {
        await beforeActivation("vault");
        vaults = [{ vaultId: "vault", displayName: "Enrolled vault" }];
        unlocked = true;
        throw new Error("Interrupted after activation");
      },
    );
    const setup = composeVaultSetup();
    await expect(setup.enroll(params)).rejects.toThrow();
    expect((await setup.inspect()).vault).toMatchObject({
      unlocked: true,
      complete: false,
    });
    const replacement = await setup.replace("vault");
    expect(await setup.verify(answers(replacement))).toBe(true);
  });
});
