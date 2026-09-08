import type { PopupSyncCapabilities } from "@/ui/entrypoints/popup/popup-sync.type";
import { getApplication } from "./first-launch.capabilities";
import { decodeTargetConfig } from "../../adapters/sync/aws-s3-sync-provider.adapter";
import { composeSync } from "./sync.capabilities";
import { composeWorkspace } from "./workspace.capabilities";
import type { SyncLocation } from "@/ui/features/sync/sync.type";

export function composePopupSync(): PopupSyncCapabilities {
  const sync = composeSync();
  const workspace = composeWorkspace();
  let currentTarget: SyncLocation | null | undefined;
  return {
    inspect: async (vaultId) => {
      const result = await (
        await getApplication()
      ).getSyncConfiguration.execute({ vaultId });
      const target =
        result.target === null
          ? null
          : decodeTargetConfig(result.target.targetConfig);
      currentTarget = target;
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
    subscribe: (listener) => {
      const unsubscribeWorkspace = workspace.subscribe(listener);
      const unsubscribeSync = sync.subscribe((reason, affectsLocation) => {
        if (
          (reason !== "permissions" && reason !== "permissions-removed") ||
          !currentTarget ||
          (affectsLocation && !affectsLocation(currentTarget))
        )
          return;
        listener("data");
      });
      return () => {
        unsubscribeWorkspace();
        unsubscribeSync();
      };
    },
  };
}
