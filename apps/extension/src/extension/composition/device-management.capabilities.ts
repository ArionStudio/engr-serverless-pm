import {
  AVAILABLE_VAULT_LOCK_DELAYS_MS,
  type RawMasterPassword,
  type SyncSetupInput,
} from "@lfspm/core";
import { JsonTextDeviceEnrollmentTransport } from "../../adapters/device";
import { BrowserS3AccessAdapter } from "../../adapters/sync/browser-s3-access.adapter";
import type {
  DeviceCapabilities,
  EnrollmentSetupInput,
} from "@/ui/features/devices/device-management.type";
import type { CredentialDraft } from "@/ui/features/sync/credential-form.view";
import { preference } from "./vault-preferences";
import { getApplication } from "./first-launch.capabilities";

import { decodeTargetConfig } from "../../adapters/sync/aws-s3-sync-provider.adapter";

const transport = new JsonTextDeviceEnrollmentTransport();
function syncConfig(draft: CredentialDraft): SyncSetupInput {
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
function requireArtifactSize(text: string) {
  if (text.length > 8_000_000) throw new Error("Enrollment file is too large.");
}
export async function completeDeviceEnrollment(
  params: EnrollmentSetupInput,
  beforeActivation?: (vaultId: string) => Promise<void>,
) {
  requireArtifactSize(params.approval);
  const enrollmentResponse = await transport.parseDeviceEnrollmentResponse(
    params.approval,
  );
  const lockAfterMs = AVAILABLE_VAULT_LOCK_DELAYS_MS.find(
    (value) => value === params.duration,
  );
  if (
    lockAfterMs === undefined ||
    !params.deviceName.trim() ||
    params.deviceName.trim().length > 80
  )
    throw new Error("Check device settings.");
  const app = await getApplication();
  const local = await app.listLocalVaults.execute();
  if (
    local.vaults.some((vault) => vault.vaultId === enrollmentResponse.vaultId)
  )
    throw new Error("This vault already exists in this browser.");
  await beforeActivation?.(enrollmentResponse.vaultId);
  const result = await app.performDeviceEnrollment.execute({
    enrollmentResponse,
    masterPassword: params.password as RawMasterPassword,
    deviceName: params.deviceName.trim(),
    lockAfterMs,
    ...(params.credentials
      ? { syncConfig: syncConfig(params.credentials) }
      : {}),
  });
  return {
    syncUpload: result.syncUpload,
    words: result.recoveryMnemonicKey.words,
    vaultId: enrollmentResponse.vaultId,
    name: result.displayName,
  };
}
export function composeDeviceManagement(): DeviceCapabilities {
  const access = new BrowserS3AccessAdapter();
  return {
    inspect: async (vaultId) => {
      const app = await getApplication();
      const [summary, configuration, local] = await Promise.all([
        app.readDeviceManagement.execute({ vaultId }),
        app.getSyncConfiguration.execute({ vaultId }),
        preference(vaultId),
      ]);
      const display = {
        ...summary,
        devices: summary.devices.map((device) =>
          device.id === summary.currentDeviceId
            ? { ...device, name: local.deviceName }
            : device,
        ),
      };
      const value = configuration.target?.targetConfig;
      if (
        typeof value === "object" &&
        value !== null &&
        "bucket" in value &&
        typeof value.bucket === "string" &&
        "region" in value &&
        typeof value.region === "string" &&
        "prefix" in value &&
        typeof value.prefix === "string"
      )
        return {
          ...display,
          location: {
            bucket: value.bucket,
            region: value.region,
            prefix: value.prefix,
          },
        };
      return display;
    },
    reviewRequest: async (text) => {
      requireArtifactSize(text);
      const request = await transport.parseDeviceEnrollmentRequest(text);
      const { payload } = request;
      return {
        fingerprint:
          await transport.fingerprintDeviceEnrollmentRequest(request),
        deviceId: payload.deviceId,
        requestId: payload.requestId,
        vaultId: payload.vaultId,
      };
    },
    approve: async (vaultId, text) => {
      requireArtifactSize(text);
      const request = await transport.parseDeviceEnrollmentRequest(text);
      const result = await (
        await getApplication()
      ).initializeDeviceEnrollment.execute({ vaultId, request });
      return {
        text: transport.serializeDeviceEnrollmentResponse(
          result.enrollmentResponse,
        ),
        syncUpload: result.syncUpload,
      };
    },
    revoke: async (vaultId, deviceId, credentials) =>
      (await getApplication()).revokeDevice.execute({
        vaultId,
        deviceId,
        ...(credentials
          ? { replacementSyncConfig: syncConfig(credentials) }
          : {}),
      }),
    createRequest: async (vaultId, fingerprint, password) => {
      if (!vaultId.trim() || !fingerprint.trim())
        throw new Error("Vault identity is required.");
      const request = await (
        await getApplication()
      ).createDeviceEnrollmentRequest.execute({
        vaultId: vaultId.trim(),
        expectedGenesisCertificateDigest: fingerprint.trim(),
        masterPassword: password as RawMasterPassword,
      });
      return {
        fingerprint:
          await transport.fingerprintDeviceEnrollmentRequest(request),
        text: transport.serializeDeviceEnrollmentRequest(request),
        requestId: request.payload.requestId,
        deviceId: request.payload.deviceId,
      };
    },
    readApproval: async (text, password) => {
      requireArtifactSize(text);
      const response = await transport.parseDeviceEnrollmentResponse(text);
      const verified = await (
        await getApplication()
      ).readDeviceEnrollmentApproval.execute({
        enrollmentResponse: response,
        masterPassword: password as RawMasterPassword,
      });
      if (verified.target.provider !== "aws-s3-v1")
        throw new Error("Unsupported sync provider.");
      return {
        vaultId: verified.vaultId,
        requestId: verified.requestId,
        location: decodeTargetConfig(verified.target.targetConfig),
      };
    },
    copy: (text) => navigator.clipboard.writeText(text),
    download: (text, kind) => {
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `lfspm-device-${kind}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    requestAccess: (location) => access.request(location),
    subscribe: (listener) => {
      const change = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        const value = changes.unlockedVaultSessionMaterial;
        const session = (input: unknown) =>
          typeof input === "object" && input !== null && "sessionId" in input
            ? input.sessionId
            : undefined;
        if (area === "session" && value)
          listener(session(value.oldValue) !== session(value.newValue));
      };
      const onFocus = () => listener(false);
      const onHide = () => listener("pagehide");
      chrome.storage.onChanged.addListener(change);
      window.addEventListener("focus", onFocus);
      window.addEventListener("pagehide", onHide);
      return () => {
        chrome.storage.onChanged.removeListener(change);
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("pagehide", onHide);
      };
    },
  };
}
