import { clipboardClearDelayMsSchema } from "@lfspm/core";
import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";
import { getApplication } from "./first-launch.capabilities";

const channelName = "lfspm-workspace-changed";
function changed() {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage("changed");
  channel.close();
}
function sessionId(value: unknown) {
  return typeof value === "object" && value !== null && "sessionId" in value
    ? value.sessionId
    : undefined;
}
export function composeWorkspace(): WorkspaceCapabilities {
  return {
    read: async (vaultId) =>
      (await getApplication()).readVaultWorkspace.execute({ vaultId }),
    details: async (vaultId, entryId) =>
      (await getApplication()).readEntry.execute({ vaultId, entryId }),
    edit: async (vaultId, entryId) =>
      (await getApplication()).readEntryForEditing.execute({
        vaultId,
        entryId,
      }),
    add: async (params) => {
      const result = await (await getApplication()).addEntry.execute(params);
      changed();
      return result;
    },
    update: async (params) => {
      const result = await (await getApplication()).updateEntry.execute(params);
      changed();
      return result;
    },
    remove: async (params) => {
      const result = await (await getApplication()).removeEntry.execute(params);
      changed();
      return result;
    },
    copy: async (vaultId, entryId) => {
      await (
        await getApplication()
      ).copyEntryPassword.execute({
        vaultId,
        entryId,
        clearAfterMs: clipboardClearDelayMsSchema.parse(30_000),
      });
    },
    tools: {
      assess: async (password) =>
        (await getApplication()).checkPasswordStrength.execute({ password }),
      generate: async (params) =>
        (await getApplication()).generatePassword.execute(params),
      username: async (params) =>
        (await getApplication()).generateUsername.execute(params),
    },
    subscribe: (listener) => {
      const channel = new BroadcastChannel(channelName);
      channel.onmessage = () => listener("data");
      const onStorage = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        const change = changes.unlockedVaultSessionMaterial;
        if (area === "session" && change)
          listener(
            sessionId(change.oldValue) !== sessionId(change.newValue)
              ? "session"
              : "data",
          );
      };
      const onFocus = () => listener("focus");
      chrome.storage.onChanged.addListener(onStorage);
      window.addEventListener("focus", onFocus);
      return () => {
        channel.close();
        chrome.storage.onChanged.removeListener(onStorage);
        window.removeEventListener("focus", onFocus);
      };
    },
  };
}
