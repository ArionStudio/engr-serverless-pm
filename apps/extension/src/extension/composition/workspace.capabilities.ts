import { subscribeWorkspaceChanges } from "./workspace-changes";
import { readActivePageUrl } from "../browser/active-page-url";
import { clipboardClearDelayMsSchema } from "@lfspm/core";
import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";
import { getApplication } from "./first-launch.capabilities";
import { IndexedDbGlobalLibraryRepository } from "@/adapters/organization";

const channelName = "lfspm-workspace-changed";
function changed() {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage("changed");
  channel.close();
}
export function composeWorkspace(): WorkspaceCapabilities {
  const organizationLibrary = new IndexedDbGlobalLibraryRepository();
  return {
    readActivePageUrl,
    dismissCapturedLogin: async (vaultId, tabId, id) =>
      (await getApplication()).browserLogins.dismiss.execute({
        vaultId,
        tabId,
        id,
      }),
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
    createTag: async (params) => {
      const result = await (await getApplication()).addTag.execute(params);
      changed();
      return result;
    },
    createFolder: async (params) => {
      const result = await (await getApplication()).addFolder.execute(params);
      changed();
      return result;
    },
    readOrganizationLibrary: () => organizationLibrary.read(),
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
      copy: async (value) =>
        (await getApplication()).copyGeneratedValue.execute({
          value,
        }),
    },
    subscribe: subscribeWorkspaceChanges,
  };
}
