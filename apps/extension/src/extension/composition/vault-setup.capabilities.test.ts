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
let storage: ReturnType<typeof createChromeStorageArea>;
let initialize: ReturnType<typeof vi.fn>;
let replace: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vaults = [];
  unlocked = false;
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
  fake.get.mockResolvedValue({
    listLocalVaults: { execute: async () => ({ vaults }) },
    getVaultSessionStatus: {
      execute: async () =>
        unlocked
          ? { status: "unlocked", vaultId: "vault" }
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
    copyRecoveryWords: { execute: vi.fn() },
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
    expect((await first.inspect())?.complete).toBe(false);
    expect(await first.verify(answers(result.value))).toBe(true);
    expect((await first.inspect())?.complete).toBe(true);
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
    expect((await setup.inspect())?.complete).toBe(false);
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
    expect((await setup.inspect())?.complete).toBe(false);
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
