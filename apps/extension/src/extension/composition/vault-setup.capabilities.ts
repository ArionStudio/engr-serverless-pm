import {
  AVAILABLE_VAULT_LOCK_DELAYS_MS,
  type RawMasterPassword,
} from "@lfspm/core";
import type {
  SetupCapabilities,
  SetupRecovery,
  SetupVault,
} from "@/ui/features/vault-setup/setup.type";
import { getApplication } from "./first-launch.capabilities";

function recordString(value: unknown, field: string): string | undefined {
  if (typeof value !== "object" || value === null || !(field in value))
    return undefined;
  const fieldValue: unknown = Reflect.get(value, field);
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

const preferenceKey = (vaultId: string) => `vault-setup:${vaultId}`;
type Preference = {
  duration: number;
  deviceName: string;
  complete: boolean;
  token: string;
};
function durationValue(value: number) {
  const duration = AVAILABLE_VAULT_LOCK_DELAYS_MS.find(
    (option) => option === value,
  );
  if (duration === undefined) throw new Error("Invalid lock duration");
  return duration;
}
async function preference(vaultId: string): Promise<Preference> {
  const value: unknown = (
    await chrome.storage.local.get(preferenceKey(vaultId))
  )[preferenceKey(vaultId)];
  if (
    typeof value === "object" &&
    value !== null &&
    "duration" in value &&
    typeof value.duration === "number" &&
    "deviceName" in value &&
    typeof value.deviceName === "string" &&
    "complete" in value &&
    typeof value.complete === "boolean" &&
    "token" in value &&
    typeof value.token === "string"
  ) {
    return {
      duration: durationValue(value.duration),
      deviceName: value.deviceName,
      complete: value.complete,
      token: value.token,
    };
  }
  return {
    duration: 600_000,
    deviceName: "This browser",
    complete: false,
    token: "",
  };
}
const writePreference = (vaultId: string, value: Preference) =>
  chrome.storage.local.set({ [preferenceKey(vaultId)]: value });

// One controller per Options document. Only non-secret preferences and completion
// receipts are persisted. Web Locks serialize first-launch creation across tabs.
export function composeVaultSetup(): SetupCapabilities {
  let recovery: SetupRecovery | undefined;
  let token = "";
  const clear = () => {
    recovery = undefined;
    token = "";
  };
  async function inspect(): Promise<SetupVault | null> {
    const app = await getApplication();
    const { vaults } = await app.listLocalVaults.execute();
    const vault = vaults[0];
    if (!vault) return null;
    const settings = await preference(vault.vaultId);
    const session = await app.getVaultSessionStatus.execute();
    return {
      vaultId: vault.vaultId,
      name: vault.displayName,
      ...settings,
      unlocked:
        session.status === "unlocked" && session.vaultId === vault.vaultId,
    };
  }
  function remember(
    vault: SetupVault,
    words: readonly string[],
    receipt: string,
  ): SetupRecovery {
    const positions = new Set<number>();
    while (positions.size < 3) {
      const random = crypto.getRandomValues(new Uint32Array(1))[0];
      const limit = Math.floor(0x100000000 / words.length) * words.length;
      if (random < limit) positions.add((random % words.length) + 1);
    }
    token = receipt;
    recovery = {
      vault,
      words,
      positions: [...positions].sort((a, b) => a - b),
    };
    return recovery;
  }
  async function requireRecovery() {
    const current = recovery;
    if (!current) throw new Error("Recovery session ended");
    const vault = await inspect();
    const settings = await preference(current.vault.vaultId);
    if (
      recovery !== current ||
      !vault?.unlocked ||
      vault.vaultId !== current.vault.vaultId ||
      settings.token !== token
    ) {
      clear();
      throw new Error("Recovery session ended");
    }
    return current;
  }
  return {
    inspect,
    clear,
    create: async (params) =>
      await navigator.locks.request("lfspm:first-vault-setup", async () => {
        if (await inspect()) throw new Error("A local vault already exists");
        const duration = durationValue(params.duration);
        const deviceName = params.deviceName.trim();
        if (!deviceName || deviceName.length > 80)
          throw new Error("Enter a device name");
        const app = await getApplication();
        const result = await app.initializeVault.execute({
          masterPassword: params.password as RawMasterPassword,
          deviceName,
          lockAfterMs: duration,
        });
        const session = await app.getVaultSessionStatus.execute();
        if (session.status !== "unlocked")
          throw new Error("Vault locked during setup");
        const receipt = crypto.randomUUID();
        token = receipt;
        await writePreference(session.vaultId, {
          duration,
          deviceName,
          complete: false,
          token: receipt,
        });
        return remember(
          {
            vaultId: session.vaultId,
            name: result.vaultDisplayName,
            deviceName,
            duration,
            complete: false,
            unlocked: true,
          },
          result.recoveryMnemonicKey.words,
          receipt,
        );
      }),
    unlock: async (vaultId, password) => {
      const settings = await preference(vaultId);
      await (
        await getApplication()
      ).unlockVault.execute({
        vaultId,
        masterPassword: password as RawMasterPassword,
        lockAfterMs: durationValue(settings.duration),
      });
      const vault = await inspect();
      if (!vault || vault.vaultId !== vaultId || !vault.unlocked)
        throw new Error("Could not unlock vault");
      return vault;
    },
    replace: async (vaultId) =>
      await navigator.locks.request("lfspm:first-vault-setup", async () => {
        clear();
        const vault = await inspect();
        if (!vault?.unlocked || vault.vaultId !== vaultId)
          throw new Error("Unlock this vault first");
        const receipt = crypto.randomUUID();
        const settings = await preference(vaultId);
        token = receipt;
        await writePreference(vaultId, {
          ...settings,
          complete: false,
          token: receipt,
        });
        const result = await (
          await getApplication()
        ).replaceRecoveryWords.execute({ vaultId });
        return remember(
          { ...vault, complete: false },
          result.recoveryMnemonicKey.words,
          receipt,
        );
      }),
    verify: async (answers) =>
      await navigator.locks.request("lfspm:first-vault-setup", async () => {
        const current = await requireRecovery();
        // The BIP39 adapter accepts exact lowercase English words. Whitespace
        // around an individual field is presentation input, not part of a word.
        if (
          !current.positions.every(
            (position) =>
              answers[position]?.trim() === current.words[position - 1],
          )
        )
          return false;
        const settings = await preference(current.vault.vaultId);
        await requireRecovery();
        await writePreference(current.vault.vaultId, {
          ...settings,
          complete: true,
        });
        clear();
        return true;
      }),
    save: async (method) => {
      const current = await requireRecovery();
      if (method === "copy") {
        await (
          await getApplication()
        ).copyRecoveryWords.execute({
          vaultId: current.vault.vaultId,
          mnemonic: { format: "BIP39", words: current.words },
        });
        return;
      }
      const record = [
        "LFSPM recovery record",
        current.vault.name,
        current.vault.deviceName,
        "",
        ...current.words.map((word, index) => `${index + 1}. ${word}`),
        "",
        "Keep this unencrypted record private and outside your vault.",
        "These words require the matching recovery data in this browser. Words alone cannot restore deleted browser data or a lost device.",
        "Never send recovery words to support or enter them on a website.",
      ].join("\n");
      if (method === "text") {
        const url = URL.createObjectURL(
          new Blob([record], { type: "text/plain;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "lfspm-recovery.txt";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const frame = document.createElement("iframe");
        frame.title = "Print recovery record";
        frame.style.display = "none";
        document.body.append(frame);
        try {
          const target = frame.contentDocument;
          const view = frame.contentWindow;
          if (!target || !view) throw new Error("Printing unavailable");
          const pre = target.createElement("pre");
          pre.style.cssText =
            "white-space:pre-wrap;font:14px/1.6 sans-serif;color:#000;background:#fff";
          pre.textContent = record;
          target.body.append(pre);
          view.focus();
          view.print();
        } finally {
          frame.remove();
        }
      }
    },
    lock: async () => {
      clear();
      await (await getApplication()).lockVault.execute();
    },
    saveDuration: async (vaultId, duration) => {
      const settings = await preference(vaultId);
      await writePreference(vaultId, {
        ...settings,
        duration: durationValue(duration),
      });
    },
    subscribe: (listener) => {
      let disposed = false;
      let checking = false;
      const check = async () => {
        if (checking || disposed) return;
        checking = true;
        try {
          if (recovery) await requireRecovery();
        } catch {
          if (!disposed) listener();
        } finally {
          checking = false;
        }
      };
      const timer = setInterval(() => {
        void check();
      }, 1000);
      const onStorage = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        const change = changes.unlockedVaultSessionMaterial;
        if (
          area === "session" &&
          change?.oldValue &&
          (!change.newValue ||
            recordString(change.oldValue, "sessionId") !==
              recordString(change.newValue, "sessionId"))
        ) {
          clear();
          listener();
        } else if (
          area === "local" &&
          Object.entries(changes).some(
            ([key, value]) =>
              key.startsWith("vault-setup:") &&
              recordString(value.newValue, "token") !== token,
          )
        ) {
          clear();
          listener();
        } else {
          void check();
        }
      };
      const onFocus = () => {
        void check();
      };
      const onHide = () => {
        clear();
        listener();
      };
      chrome.storage.onChanged.addListener(onStorage);
      window.addEventListener("pagehide", onHide);
      window.addEventListener("focus", onFocus);
      return () => {
        disposed = true;
        clearInterval(timer);
        chrome.storage.onChanged.removeListener(onStorage);
        window.removeEventListener("pagehide", onHide);
        window.removeEventListener("focus", onFocus);
        clear();
      };
    },
  };
}
