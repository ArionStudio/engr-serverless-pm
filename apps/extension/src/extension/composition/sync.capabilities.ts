import { BrowserS3AccessAdapter } from "../../adapters/sync/browser-s3-access.adapter";
import {
  RemoteVaultSnapshotAheadError,
  type SyncSetupInput,
  type RawMasterPassword,
} from "@lfspm/core";
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
    revealAccessKeys: async (vaultId, password) => {
      const { credentials, sessionId } = await (
        await getApplication()
      ).revealSyncCredentials.execute({
        vaultId,
        masterPassword: password as RawMasterPassword,
      });
      const value = credentials.credentialsConfig;
      if (
        credentials.provider !== "aws-s3-v1" ||
        typeof value !== "object" ||
        value === null ||
        !("accessKeyId" in value) ||
        !("secretAccessKey" in value) ||
        typeof value.accessKeyId !== "string" ||
        typeof value.secretAccessKey !== "string"
      ) {
        throw new Error("Unsupported sync credentials");
      }
      return {
        accessKeyId: value.accessKeyId,
        secretAccessKey: value.secretAccessKey,
        sessionId,
      };
    },
    copyAccessKey: async (vaultId, sessionId, value) =>
      (await getApplication()).copyRevealedSecret.execute({
        vaultId,
        sessionId,
        value,
      }),
    inspectManagement: async (vaultId) => {
      const result = await (
        await getApplication()
      ).getSyncConfiguration.execute({ vaultId });
      return {
        providerCredentialRevocationPending:
          result.providerCredentialRevocationPending,
        syncRemovalPending: result.syncRemovalPending,
      };
    },
    disable: async (vaultId) =>
      (await getApplication()).disableSync.execute({ vaultId }),
    completeCredentialRevocation: async (vaultId) =>
      (await getApplication()).completeProviderCredentialRevocation.execute({
        vaultId,
      }),
    prepareEnrollment: async (vaultId) =>
      (await getApplication()).prepareDeviceEnrollmentConsumption.execute({
        vaultId,
      }),
    prepareRevocation: async (vaultId, draft) =>
      (await getApplication()).prepareDeviceRevocationConsumption.execute({
        vaultId,
        replacementSyncConfig: config(draft),
      }),
    acceptEnrollment: async (params) =>
      (await getApplication()).consumeDeviceEnrollment.execute(params),
    acceptRevocation: async (params, draft) =>
      (await getApplication()).consumeDeviceRevocation.execute({
        ...params,
        replacementSyncConfig: config(draft),
      }),
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
      const application = await getApplication();
      try {
        return {
          kind: "enabled" as const,
          result: await application.setupSync.execute({ vaultId, syncConfig }),
        };
      } catch (error) {
        if (!(error instanceof RemoteVaultSnapshotAheadError)) throw error;
        return {
          kind: "existing" as const,
          connection: await application.prepareExistingSyncConnection.execute({
            vaultId,
            syncConfig,
          }),
        };
      }
    },
    connectExisting: async (vaultId, draft, connection) => {
      const result = await (
        await getApplication()
      ).connectExistingSync.execute({
        vaultId,
        syncConfig: config(draft),
        reviewedSnapshotIdentities: connection.reviewedSnapshotIdentities,
      });
      return { ...result, syncUpload: "complete" };
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
      const onPermissions = () => listener("permissions");
      chrome.permissions.onAdded.addListener(onPermissions);
      chrome.permissions.onRemoved.addListener(onPermissions);
      const onFocus = () => listener("focus");
      const onHide = () => listener("pagehide");
      chrome.storage.onChanged.addListener(onStorage);
      window.addEventListener("focus", onFocus);
      window.addEventListener("pagehide", onHide);
      return () => {
        chrome.permissions.onAdded.removeListener(onPermissions);
        chrome.permissions.onRemoved.removeListener(onPermissions);
        chrome.storage.onChanged.removeListener(onStorage);
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("pagehide", onHide);
      };
    },
  };
}
