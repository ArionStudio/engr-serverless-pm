import type { VersionVector } from "@lfspm/core";
import type { SyncCapabilities } from "@/ui/features/sync/sync.type";
import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";

export type PopupSyncSnapshot = {
  version: VersionVector;
  configured: boolean;
  access: boolean;
  removalPending: boolean;
};
export type PopupSyncCapabilities = Pick<
  SyncCapabilities,
  "review" | "upload" | "apply"
> & {
  inspect: (vaultId: string) => Promise<PopupSyncSnapshot>;
  subscribe: WorkspaceCapabilities["subscribe"];
};
