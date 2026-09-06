// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import { composeVaultSetup } from "./vault-setup.capabilities";
import type { SetupRecovery } from "@/ui/features/vault-setup/setup.type";

const fake = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("./first-launch.capabilities", () => ({ getApplication: fake.get }));
const words = Array.from({ length: 24 }, (_, i) => `word${i}`);
let vaults: { vaultId: string; displayName: string }[];
let unlocked: boolean;
let activeVaultId: string;
let storage: ReturnType<typeof createChromeStorageArea>;
let initialize: ReturnType<typeof vi.fn>;
let replace: ReturnType<typeof vi.fn>;
let copy: ReturnType<typeof vi.fn>;
beforeEach(() => {
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
    unlockVault: {
      execute: async () => {
        unlocked = true;
      },
    },
    lockVault: {
      execute: async () => {
        unlocked = false;
      },
    },
    copyRecoveryWords: { execute: copy },
  });
});
afterEach(() => {
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
