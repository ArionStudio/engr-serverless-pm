import { BrowserS3AccessAdapter } from "../../adapters/sync/browser-s3-access.adapter";
import type { SyncSetupInput } from "@lfspm/core";
import type { CredentialDraft } from "@/ui/features/sync/credential-form.view";
import type {
  SyncCapabilities,
  SyncLocation,
} from "@/ui/features/sync/sync.type";
import { getApplication } from "./first-launch.capabilities";

function config(draft: CredentialDraft): SyncSetupInput {
  return {
    provider: "aws-s3-v1",
    providerConfig: {
      target: {
        bucket: draft.bucket,
        region: draft.region,
        prefix: draft.prefix,
      },
      credentials: {
        accessKeyId: draft.accessKeyId,
        secretAccessKey: draft.secretAccessKey,
      },
    },
  };
}
function location(value: unknown): SyncLocation {
  if (
    typeof value !== "object" ||
    value === null ||
    !("bucket" in value) ||
    !("region" in value) ||
    !("prefix" in value) ||
    typeof value.bucket !== "string" ||
    typeof value.region !== "string" ||
    typeof value.prefix !== "string"
  )
    throw new Error("Unsupported sync target");
  return { bucket: value.bucket, region: value.region, prefix: value.prefix };
}
function sessionId(value: unknown): unknown {
  return typeof value === "object" && value !== null && "sessionId" in value
    ? value.sessionId
    : undefined;
}
export function composeSync(): SyncCapabilities {
  const access = new BrowserS3AccessAdapter();
  return {
    requestAccess: (target) => access.request(target),
    hasAccess: (target) => access.contains(target),
    copySetupText: (value) => navigator.clipboard.writeText(value),
    inspect: async (vaultId) => {
      const { target } = await (
        await getApplication()
      ).getSyncConfiguration.execute({ vaultId });
      return target === null ? null : location(target.targetConfig);
    },
    test: async (vaultId, draft) => {
      const syncConfig = config(draft);
      await (
        await getApplication()
      ).testSyncAccess.execute({ vaultId, syncConfig });
    },
    configure: async (vaultId, draft) => {
      const syncConfig = config(draft);
      return (await getApplication()).setupSync.execute({
        vaultId,
        syncConfig,
      });
    },
    repair: async (vaultId, draft) => {
      const syncConfig = config(draft);
      await (
        await getApplication()
      ).updateSyncCredentials.execute({ vaultId, syncConfig });
    },
    upload: async (vaultId) =>
      (await getApplication()).syncUpload.execute({ vaultId }),
    review: async (vaultId) =>
      (await getApplication()).prepareSyncReview.execute({ vaultId }),
    apply: async (params) =>
      (await getApplication()).applySyncResolution.execute(params),
    subscribe: (listener) => {
      const onStorage = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        const change = changes.unlockedVaultSessionMaterial;
        if (
          area === "session" &&
          change &&
          sessionId(change.oldValue) !== sessionId(change.newValue)
        )
          listener("session");
      };
      const onPermissions = (change: chrome.permissions.Permissions) =>
        listener("permissions", (target) => access.affects(target, change));
      const onPermissionsRemoved = (change: chrome.permissions.Permissions) =>
        listener("permissions-removed", (target) =>
          access.affects(target, change),
        );
      chrome.permissions.onAdded.addListener(onPermissions);
      chrome.permissions.onRemoved.addListener(onPermissionsRemoved);
      const onFocus = () => listener("focus");
      const onHide = () => listener("session");
      chrome.storage.onChanged.addListener(onStorage);
      window.addEventListener("focus", onFocus);
      window.addEventListener("pagehide", onHide);
      return () => {
        chrome.permissions.onAdded.removeListener(onPermissions);
        chrome.permissions.onRemoved.removeListener(onPermissionsRemoved);
        chrome.storage.onChanged.removeListener(onStorage);
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("pagehide", onHide);
      };
    },
  };
}
