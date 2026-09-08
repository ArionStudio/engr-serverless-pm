import { subscribeWorkspaceChanges } from "./workspace-changes";
import type { FolderManagementCapabilities } from "@/ui/features/folders";
import { getApplication } from "./first-launch.capabilities";
import { IndexedDbGlobalLibraryRepository } from "@/adapters/organization";

const channelName = "lfspm-workspace-changed";

function changed() {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage("changed");
  channel.close();
}

export function composeFolderManagement(): FolderManagementCapabilities {
  const organizationLibrary = new IndexedDbGlobalLibraryRepository();
  return {
    readOrganizationLibrary: () => organizationLibrary.read(),
    read: async (vaultId) =>
      (await getApplication()).readFolders.execute({ vaultId }),
    add: async (params) => {
      const result = await (await getApplication()).addFolder.execute(params);
      changed();
      return result;
    },
    update: async (params) => {
      const result = await (
        await getApplication()
      ).updateFolder.execute(params);
      changed();
      return result;
    },
    move: async (params) => {
      const result = await (await getApplication()).moveFolder.execute(params);
      changed();
      return result;
    },
    remove: async (params) => {
      const result = await (
        await getApplication()
      ).removeFolder.execute(params);
      changed();
      return result;
    },
    subscribe: (listener) => subscribeWorkspaceChanges(() => listener()),
  };
}
