import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Checkbox } from "@/ui/components/primitives/checkbox";
import { Button } from "@/ui/components/primitives/button";
import { TextField, PasswordField } from "@/ui/components/forms/fields.view";
import { GuidancePanel } from "@/ui/components/feedback/guidance-panel.view";
import { DeviceSummary, TransferInput, TransferOutput } from "./devices.view";
import type { DeviceCapabilities } from "./device-management.type";
import type { CredentialDraft } from "../sync/credential-form.view";
import { syncError } from "../sync/sync-error";
import { vaultAuthorizationWasLost } from "@/ui/lib/vault-authorization";

export function DeviceManagementView({
  vaultId,
  capabilities,
  onOpenSync,
  onSessionLost,
}: {
  vaultId: string;
  capabilities: DeviceCapabilities;
  onOpenSync: () => void;
  onSessionLost?: () => void;
}) {
  const [data, setData] =
    useState<Awaited<ReturnType<DeviceCapabilities["inspect"]>>>();
  const [section, setSection] = useState<"list" | "add" | "approve">("list");
  const [text, setText] = useState("");
  const [review, setReview] = useState<{
    deviceId: string;
    fingerprint: string;
    requestId: string;
    vaultId: string;
  }>();
  const [output, setOutput] = useState<string>();
  const [target, setTarget] = useState<string>();
  const [credentials, setCredentials] = useState<CredentialDraft>({
    bucket: "",
    region: "",
    prefix: "vault/",
    accessKeyId: "",
    secretAccessKey: "",
  });
  const [revealed, setRevealed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const confirmationId = useId();
  const epoch = useRef(0);
  const busy = useRef(false);
  const inspection = useRef(0);
  const clearPrivateState = useCallback(() => {
    ++inspection.current;
    epoch.current += 1;
    busy.current = false;
    setPending(false);
    setSection("list");
    setText("");
    setReview(undefined);
    setOutput(undefined);
    setTarget(undefined);
    setCredentials({
      bucket: "",
      region: "",
      prefix: "vault/",
      accessKeyId: "",
      secretAccessKey: "",
    });
    setRevealed(false);
    setConfirmed(false);
    setData(undefined);
    setError(undefined);
    setNotice(undefined);
  }, []);
  const refresh = useCallback(async () => {
    const revision = epoch.current;
    const request = ++inspection.current;
    const applyRead = (
      next: Awaited<ReturnType<typeof capabilities.inspect>>,
    ) => {
      if (revision !== epoch.current || request !== inspection.current) return;
      setData(next);
      if (next.location)
        setCredentials((draft) => ({ ...draft, ...next.location }));
    };
    try {
      const next = await capabilities.inspect(vaultId);
      applyRead(next);
    } catch (cause) {
      if (revision !== epoch.current || request !== inspection.current) return;
      const lost = await vaultAuthorizationWasLost(cause, async () => {
        applyRead(await capabilities.inspect(vaultId));
      });
      if (revision !== epoch.current || request !== inspection.current || !lost)
        return;
      clearPrivateState();
      onSessionLost?.();
    }
  }, [capabilities, clearPrivateState, onSessionLost, vaultId]);
  useEffect(() => {
    const inspections = inspection;
    void refresh();
    const unsubscribe = capabilities.subscribe((invalidate = true) => {
      if (!invalidate) {
        void refresh();
        return;
      }
      clearPrivateState();
      if (invalidate === "pagehide") return;
      onSessionLost?.();
      setError("Your vault session changed. Reopen Devices to continue.");
    });
    return () => {
      epoch.current += 1;
      ++inspections.current;
      unsubscribe();
    };
  }, [capabilities, clearPrivateState, onSessionLost, refresh]);
  async function run(
    action: () => Promise<void>,
    failure: string | ((error: unknown) => string),
  ) {
    if (busy.current) return;
    busy.current = true;
    const revision = epoch.current;
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
    } catch (cause) {
      if (revision !== epoch.current) return;
      const lost = await vaultAuthorizationWasLost(cause, () =>
        capabilities.inspect(vaultId),
      );
      if (revision !== epoch.current) return;
      if (lost) {
        clearPrivateState();
        onSessionLost?.();
        return;
      }
      setError(typeof failure === "string" ? failure : failure(cause));
    } finally {
      if (revision === epoch.current) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  function reset() {
    setSection("list");
    setReview(undefined);
    setText("");
    setOutput(undefined);
    setTarget(undefined);
    setConfirmed(false);
    setRevealed(false);
    setError(undefined);
    setCredentials((current) => ({
      ...current,
      accessKeyId: "",
      secretAccessKey: "",
    }));
  }
  async function file(file: File) {
    if (busy.current) return;
    setText("");
    setReview(undefined);
    setConfirmed(false);
    if (file.size > 8_000_000) {
      setError("Choose an enrollment file smaller than 8 MB.");
      return;
    }
    await run(async () => {
      const revision = epoch.current;
      const value = await file.text();
      if (revision === epoch.current) setText(value);
    }, "Could not read this file.");
  }
  const syncConfigured = data?.syncConfigured ?? false;
  const currentTarget = data?.devices.find((device) => device.id === target);
  return (
    <section
      className="@container/devices space-y-7"
      aria-labelledby="devices-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="devices-heading" className="text-2xl font-semibold">
          Devices
        </h1>
        {section === "list" && !target && syncConfigured ? (
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setSection("approve")}>
              Approve a device
            </Button>
            <Button onClick={() => setSection("add")}>Add a device</Button>
          </div>
        ) : section !== "list" || target ? (
          <Button variant="ghost" disabled={pending} onClick={reset}>
            Back to devices
          </Button>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-destructive"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <div role="status">
          <GuidancePanel title="Device access updated">{notice}</GuidancePanel>
        </div>
      ) : null}
      {data && !syncConfigured ? (
        <GuidancePanel title="Set up sync to add a device">
          <p>Connect this vault to S3 before adding another device.</p>
          <Button onClick={onOpenSync}>Set up sync</Button>
        </GuidancePanel>
      ) : null}
      {!data && !error ? <p role="status">Loading devices…</p> : null}
      {data && section === "list" && !target ? (
        <div className="grid gap-4 @2xl/devices:grid-cols-2 @4xl/devices:grid-cols-3">
          {data.devices.map((device) => (
            <DeviceSummary
              key={device.id}
              name={device.name}
              identifier={device.id}
              state={device.state}
              onRevoke={
                device.state === "other"
                  ? () => {
                      setTarget(device.id);
                      setConfirmed(false);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
      {data && syncConfigured && section === "add" ? (
        <div className="max-w-3xl space-y-6">
          <h2 className="text-xl font-semibold">Connect another browser</h2>
          <GuidancePanel title="Use a trusted channel">
            <p>
              On the new browser, choose Existing vault. Enter this vault ID and
              fingerprint, then create an access request. Compare the request
              fingerprint on both devices before approving it.
            </p>
            <p>
              The fingerprint identifies your vault. Share it directly with your
              own device so another vault cannot be substituted.
            </p>
          </GuidancePanel>
          <TextField label="Vault ID" value={data.vaultId} readOnly />
          <TextField
            label="Vault fingerprint"
            value={data.genesisCertificateDigest}
            readOnly
          />
          <Button
            variant="outline"
            onClick={() =>
              void run(async () => {
                const revision = epoch.current;
                await capabilities.copy(
                  `${data.vaultId}\n${data.genesisCertificateDigest}`,
                );
                if (revision !== epoch.current) return;
                setNotice("Vault identity copied.");
              }, "Could not copy the vault identity.")
            }
          >
            Copy vault identity
          </Button>
          <Button onClick={() => setSection("approve")}>
            I have an access request
          </Button>
        </div>
      ) : null}
      {(output || (data && syncConfigured)) && section === "approve" ? (
        <div className="max-w-3xl space-y-6">
          <h2 className="text-xl font-semibold">Approve a device</h2>
          {output ? (
            <TransferOutput
              description="Transfer this approval to the browser that created the request. The approval contains an encrypted vault copy; keep it private."
              metadata="Device approval"
              onCopy={() =>
                void run(async () => {
                  const revision = epoch.current;
                  await capabilities.copy(output);
                  if (revision !== epoch.current) return;
                  setNotice("Approval copied.");
                }, "Could not copy the approval.")
              }
              onExport={() => capabilities.download(output, "approval")}
            />
          ) : (
            <>
              <TransferInput
                value={text}
                onChange={(value) => {
                  setText(value);
                  setReview(undefined);
                  setConfirmed(false);
                }}
                onFile={(value) => void file(value)}
                state={pending ? "validating" : text ? "selected" : "empty"}
              />
              {review ? (
                <>
                  <GuidancePanel
                    variant="warning"
                    title="Confirm this is your device"
                  >
                    <p>
                      Compare this request fingerprint with the one displayed on
                      the new browser. Approval gives that device access to the
                      vault.
                    </p>
                    <p className="break-all font-mono">{review.fingerprint}</p>
                  </GuidancePanel>
                  <label className="flex items-start gap-3">
                    <Checkbox
                      checked={confirmed}
                      onCheckedChange={setConfirmed}
                      aria-labelledby={confirmationId}
                    />
                    <span id={confirmationId}>
                      The request fingerprint matches my new device.
                    </span>
                  </label>
                  <Button
                    disabled={pending || !confirmed}
                    onClick={() => {
                      const location = data?.location;
                      if (!location) {
                        setError(
                          "This vault's S3 location could not be read. Open Sync to check the bucket, region and prefix before approving a device.",
                        );
                        return;
                      }
                      void run(
                        async () => {
                          const revision = epoch.current;
                          await capabilities.requestAccess(location);
                          if (revision !== epoch.current) return;
                          const result = await capabilities.approve(
                            vaultId,
                            text,
                          );
                          if (revision !== epoch.current) return;
                          setOutput(result.text);
                          setText("");
                          setReview(undefined);
                          setNotice(
                            result.syncUpload === "pending"
                              ? "Device approved locally. Retry the pending upload in Sync before connecting the new browser."
                              : "Device approved. Transfer the approval to finish connecting.",
                          );
                          await refresh();
                        },
                        (cause) => syncError(cause, "approve-device"),
                      );
                    }}
                  >
                    {pending ? "Approving…" : "Approve device"}
                  </Button>
                </>
              ) : (
                <Button
                  disabled={pending || !text.trim()}
                  onClick={() =>
                    void run(async () => {
                      const revision = epoch.current;
                      const next = await capabilities.reviewRequest(text);
                      if (next.vaultId !== vaultId)
                        throw new Error("Wrong vault");
                      if (revision === epoch.current) setReview(next);
                    }, "This request is invalid or belongs to another vault. Export it again from the new device.")
                  }
                >
                  Review access request
                </Button>
              )}
            </>
          )}
        </div>
      ) : null}
      {currentTarget ? (
        <div className="max-w-3xl space-y-6">
          <h2 className="text-xl font-semibold">Revoke {currentTarget.name}</h2>
          <GuidancePanel
            variant="warning"
            title="This device will lose future vault access"
          >
            <p>
              Revocation rotates the vault key. It cannot erase passwords or
              vault copies already saved on that device.
            </p>
            {syncConfigured ? (
              <p>
                Create replacement S3 access keys for the same bucket and
                prefix. After revocation, delete all old keys available to the
                revoked device in AWS, then complete the key check in Sync.
              </p>
            ) : null}
          </GuidancePanel>
          {syncConfigured ? (
            <fieldset disabled={pending} className="space-y-5">
              <legend className="mb-4 font-semibold">
                Replacement S3 access
              </legend>
              {(["bucket", "region", "prefix", "accessKeyId"] as const).map(
                (key) => (
                  <TextField
                    key={key}
                    label={
                      {
                        bucket: "Bucket",
                        region: "Region",
                        prefix: "Object prefix",
                        accessKeyId: "New access key ID",
                      }[key]
                    }
                    value={credentials[key]}
                    readOnly={key !== "accessKeyId" && !!data?.location}
                    onChange={(event) =>
                      setCredentials((value) => ({
                        ...value,
                        [key]: event.target.value,
                      }))
                    }
                  />
                ),
              )}
              <PasswordField
                label="New secret access key"
                value={credentials.secretAccessKey}
                onChange={(value) =>
                  setCredentials((current) => ({
                    ...current,
                    secretAccessKey: value,
                  }))
                }
                revealed={revealed}
                onRevealChange={setRevealed}
              />
            </fieldset>
          ) : null}
          <label className="flex items-start gap-3">
            <Checkbox
              checked={confirmed}
              onCheckedChange={setConfirmed}
              aria-labelledby={confirmationId}
            />
            <span id={confirmationId}>Revoke access for this device.</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" disabled={pending} onClick={reset}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                pending ||
                !confirmed ||
                (syncConfigured &&
                  (!credentials.bucket.trim() ||
                    !credentials.region.trim() ||
                    !credentials.accessKeyId.trim() ||
                    !credentials.secretAccessKey))
              }
              onClick={() =>
                void run(
                  async () => {
                    const revision = epoch.current;
                    if (syncConfigured)
                      await capabilities.requestAccess({
                        bucket: credentials.bucket,
                        region: credentials.region,
                        prefix: credentials.prefix,
                      });
                    if (revision !== epoch.current) return;
                    const result = await capabilities.revoke(
                      vaultId,
                      currentTarget.id,
                      syncConfigured ? credentials : undefined,
                    );
                    if (revision !== epoch.current) return;
                    reset();
                    setNotice(
                      result.syncUpload === "pending"
                        ? "Device revoked locally. Retry the pending upload in Sync before deleting old S3 keys."
                        : result.providerCredentialRevocation ===
                            "pending_external_deletion"
                          ? "Device revoked. Delete its old S3 keys in AWS, then finish the access-key check in Sync."
                          : "Device revoked.",
                    );
                    await refresh();
                  },
                  (cause) => syncError(cause, "revoke-device"),
                )
              }
            >
              {pending ? "Revoking…" : "Revoke device"}
            </Button>
          </div>
        </div>
      ) : null}
      {notice || (data && syncConfigured) ? (
        <Button variant="outline" onClick={onOpenSync}>
          Open Sync
        </Button>
      ) : null}
    </section>
  );
}
