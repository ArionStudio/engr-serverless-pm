import type { PopupSyncCapabilities } from "@/ui/entrypoints/popup/popup-sync.type";
import { getApplication } from "./first-launch.capabilities";
import { decodeTargetConfig } from "../../adapters/sync/aws-s3-sync-provider.adapter";
import { composeSync } from "./sync.capabilities";
import { composeWorkspace } from "./workspace.capabilities";

export function composePopupSync(): PopupSyncCapabilities {
  const sync = composeSync();
  return {
    inspect: async (vaultId) => {
      const result = await (
        await getApplication()
      ).getSyncConfiguration.execute({ vaultId });
      const target =
        result.target === null
          ? null
          : decodeTargetConfig(result.target.targetConfig);
      return {
        version: result.snapshotVersionVector,
        configured: result.target !== null,
        removalPending: result.syncRemovalPending,
        access: target !== null && (await sync.hasAccess(target)),
      };
    },
    review: sync.review,
    upload: sync.upload,
    apply: sync.apply,
    subscribe: composeWorkspace().subscribe,
  };
}
