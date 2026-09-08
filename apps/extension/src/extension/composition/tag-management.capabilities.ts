import { subscribeWorkspaceChanges } from "./workspace-changes";
import type { TagManagementCapabilities } from "@/ui/features/tags";
import { getApplication } from "./first-launch.capabilities";

const channelName = "lfspm-workspace-changed";
function changed() {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage("changed");
  channel.close();
}

export function composeTagManagement(): TagManagementCapabilities {
  return {
    read: async (vaultId) => {
      const application = await getApplication();
      const [tags, groups] = await Promise.all([
        application.readTags.execute({ vaultId }),
        application.readTagGroups.execute({ vaultId }),
      ]);
      return { ...tags, ...groups };
    },
    add: async (params) => {
      const result = await (await getApplication()).addTag.execute(params);
      changed();
      return result;
    },
    update: async (params) => {
      const result = await (await getApplication()).updateTag.execute(params);
      changed();
      return result;
    },
    remove: async (params) => {
      const result = await (await getApplication()).removeTag.execute(params);
      changed();
      return result;
    },
    subscribe: (listener) => subscribeWorkspaceChanges(() => listener()),
  };
}
