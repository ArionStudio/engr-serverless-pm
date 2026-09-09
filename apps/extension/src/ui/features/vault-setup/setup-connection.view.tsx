import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/components/primitives/button";
import {
  TextField,
  PasswordField,
  LockDurationField,
} from "@/ui/components/forms/fields.view";
import { GuidancePanel } from "@/ui/components/feedback/guidance-panel.view";
import { StepNavigation } from "@/ui/components/layout/sections.view";
import { vaultLockOptions } from "@/ui/lib/vault-lock-options";
import { TransferInput, TransferOutput } from "../devices/devices.view";
import type {
  DeviceCapabilities,
  EnrollmentSetupInput,
} from "../devices/device-management.type";
import type { CredentialDraft } from "../sync/credential-form.view";
import type { AssessPassword, GenerateVaultPassword } from "./setup.type";
import { SetupPassword } from "./setup-password.view";
import { useOperationErrorFocus } from "./use-operation-error-focus";

export type SetupConnectionStep =
  | "identity"
  | "password"
  | "request"
  | "approval";
export type SetupConnectionRequest = Awaited<
  ReturnType<DeviceCapabilities["createRequest"]>
>;

export function SetupConnection({
  onBack,
  capabilities,
  assessPassword,
  generatePassword,
  onEnroll,
  pending = false,
  error: externalError,
  initialStep = "identity",
  initialRequest,
}: {
  onBack: () => void;
  capabilities: DeviceCapabilities;
  assessPassword: AssessPassword;
  generatePassword: GenerateVaultPassword;
  onEnroll: (input: EnrollmentSetupInput) => Promise<void>;
  pending?: boolean;
  error?: string;
  initialStep?: SetupConnectionStep;
  initialRequest?: SetupConnectionRequest;
}) {
  const [step, setStep] = useState<SetupConnectionStep>(initialStep);
  const [vaultId, setVaultId] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [password, setPassword] = useState({ password: "", confirmation: "" });
  const [deviceName, setDeviceName] = useState("This browser");
  const [duration, setDuration] = useState(600_000);
  const [request, setRequest] = useState<SetupConnectionRequest | undefined>(
    initialRequest,
  );
  const [approvalVerified, setApprovalVerified] = useState(false);
  const [approval, setApproval] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [credentials, setCredentials] = useState<CredentialDraft>({
    bucket: "",
    region: "",
    prefix: "vault/",
    accessKeyId: "",
    secretAccessKey: "",
  });
  const [localPending, setLocalPending] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const visibleError = error ?? externalError;
  const errorRef = useOperationErrorFocus(visibleError);
  const storageSection = useRef<HTMLElement>(null);
  useEffect(() => {
    if (approvalVerified) storageSection.current?.focus();
  }, [approvalVerified]);
  const busy = useRef(false);
  const epoch = useRef(0);
  useEffect(() => {
    const unsubscribe = capabilities.subscribe((invalidate = true) => {
      if (!invalidate) return;
      epoch.current += 1;
      busy.current = false;
      setLocalPending(false);
      setPassword({ password: "", confirmation: "" });
      setUnlockPassword("");
      setRevealed(false);
      setSecretRevealed(false);
      setApproval("");
      setApprovalVerified(false);
      setRequest(undefined);
      setStep("identity");
      setCredentials((current) => ({
        ...current,
        accessKeyId: "",
        secretAccessKey: "",
      }));
    });
    return () => {
      epoch.current += 1;
      unsubscribe();
    };
  }, [capabilities]);
  const working = pending || localPending;
  async function run(action: () => Promise<void>, message: string) {
    if (busy.current || pending) return;
    busy.current = true;
    const revision = epoch.current;
    setLocalPending(true);
    setError(undefined);
    try {
      await action();
    } catch {
      if (revision === epoch.current) setError(message);
    } finally {
      if (revision === epoch.current) {
        busy.current = false;
        setLocalPending(false);
      }
    }
  }
  function invalidateApproval() {
    setError(undefined);
    setApprovalVerified(false);
    setSecretRevealed(false);
    setCredentials({
      bucket: "",
      region: "",
      prefix: "",
      accessKeyId: "",
      secretAccessKey: "",
    });
  }
  function navigate(target: string) {
    if (working || target === step) return;
    setError(undefined);
    if (target === "identity" && !request) {
      setApproval("");
      invalidateApproval();
      setStep("identity");
    } else if (
      target === "password" &&
      !request &&
      (step === "password" || step === "request")
    ) {
      setStep("password");
    } else if (target === "request" && request) {
      setApproval("");
      invalidateApproval();
      setStep("request");
    }
  }
  async function file(value: File) {
    if (busy.current || pending) return;
    setApproval("");
    invalidateApproval();
    if (value.size > 8_000_000) {
      setError("Choose an approval file smaller than 8 MB.");
      return;
    }
    await run(async () => {
      const revision = epoch.current;
      const text = await value.text();
      if (revision === epoch.current) setApproval(text);
    }, "Could not read this file.");
  }
  const title = {
    identity: "Connect a vault",
    password: "Password for this browser",
    request: "Request access",
    approval: "Import device approval",
  }[step];
  return (
    <section className="max-w-3xl space-y-7" aria-label="Connect a vault">
      <StepNavigation
        currentId={step}
        onNavigate={navigate}
        steps={[
          {
            id: "identity",
            label: "Vault",
            state:
              step === "identity" && visibleError
                ? ("error" as const)
                : step === "identity"
                  ? ("upcoming" as const)
                  : ("complete" as const),
            allowed: !working && !request,
          },
          {
            id: "password",
            label: "Browser password",
            state:
              step === "password" && visibleError
                ? ("error" as const)
                : request || step === "approval"
                  ? ("complete" as const)
                  : ("upcoming" as const),
            allowed:
              !working &&
              !request &&
              (step === "password" || step === "request"),
          },
          {
            id: "request",
            label: "Access request",
            state:
              step === "request" && visibleError
                ? ("error" as const)
                : step === "approval"
                  ? ("complete" as const)
                  : ("upcoming" as const),
            allowed: !working && (step === "request" || !!request),
          },
          {
            id: "approval",
            label: "Approval",
            state:
              step === "approval" && visibleError
                ? ("error" as const)
                : ("upcoming" as const),
            allowed: !working && step === "approval",
          },
        ]}
      />
      {step !== "password" ? (
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      ) : null}
      {visibleError ? (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          data-focus-target
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-destructive outline-none"
        >
          {visibleError}
        </p>
      ) : null}
      {step === "identity" ? (
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (vaultId.trim() && fingerprint.trim()) setStep("password");
          }}
        >
          <GuidancePanel title="Start from your trusted device">
            <p>
              Unlock your vault on the trusted browser and set up S3 sync. In
              Devices, choose Add a device and copy its vault ID and fingerprint
              here.
            </p>
          </GuidancePanel>
          <TextField
            label="Vault ID"
            value={vaultId}
            required
            onChange={(event) => setVaultId(event.target.value)}
          />
          <TextField
            label="Vault fingerprint"
            value={fingerprint}
            required
            description="Compare the full fingerprint with your trusted device."
            onChange={(event) => setFingerprint(event.target.value)}
          />
          <div className="flex flex-wrap justify-between gap-3">
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
            <Button type="submit">Continue to browser password</Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep("approval")}
          >
            I already have an approval
          </Button>
        </form>
      ) : null}
      {step === "password" ? (
        <SetupPassword
          value={password}
          onChange={setPassword}
          onContinue={() => setStep("request")}
          onBack={() => setStep("identity")}
          assessPassword={assessPassword}
          generatePassword={generatePassword}
          continueLabel="Continue to access request"
        />
      ) : null}
      {step === "request" ? (
        <div className="space-y-6">
          {request ? (
            <>
              <GuidancePanel title="Compare before approving">
                <p>
                  On your trusted browser, choose Devices → Approve a device.
                  Import this request and compare its request fingerprint with
                  the one below.
                </p>
                <p className="break-all font-mono">{request.fingerprint}</p>
              </GuidancePanel>
              <TransferOutput
                title="Access request"
                headingLevel="h2"
                description="Send this access request to your trusted browser."
                metadata={`New device: ${request.deviceId}`}
                pending={working}
                onCopy={() =>
                  void run(async () => {
                    const revision = epoch.current;
                    await capabilities.copy(request.text);
                    if (revision !== epoch.current) return;
                    setCopied(true);
                  }, "Could not copy the request.")
                }
                onExport={() => capabilities.download(request.text, "request")}
              />
              {copied ? <p role="status">Request copied.</p> : null}
              <Button onClick={() => setStep("approval")}>
                I have the approval
              </Button>
            </>
          ) : (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const revision = epoch.current;
                  const result = await capabilities.createRequest(
                    vaultId,
                    fingerprint,
                    password.password,
                  );
                  if (revision !== epoch.current) return;
                  setRequest(result);
                  setPassword({ password: "", confirmation: "" });
                }, "Could not create an access request. Check the vault identity and use a strong password.");
              }}
            >
              <fieldset disabled={working} className="space-y-6">
                <TextField
                  label="Device name"
                  value={deviceName}
                  maxLength={80}
                  required
                  onChange={(event) => setDeviceName(event.target.value)}
                />
                <LockDurationField
                  value={duration}
                  onChange={setDuration}
                  options={vaultLockOptions}
                  description="Time since unlocking, including while you save recovery words."
                />
                <div className="flex flex-wrap justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("password")}
                  >
                    Back
                  </Button>
                  <Button type="submit">
                    {working ? "Creating request…" : "Create access request"}
                  </Button>
                </div>
              </fieldset>
            </form>
          )}
        </div>
      ) : null}
      {step === "approval" ? (
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              async () => {
                const revision = epoch.current;
                if (!approvalVerified) {
                  const response = await capabilities.readApproval(
                    approval,
                    unlockPassword,
                  );
                  if (revision !== epoch.current) return;
                  if (request && response.requestId !== request.requestId)
                    throw new Error("Wrong request");
                  setCredentials({
                    ...response.location,
                    accessKeyId: "",
                    secretAccessKey: "",
                  });
                  setApprovalVerified(true);
                  setRevealed(false);
                  return;
                }
                await capabilities.requestAccess({
                  bucket: credentials.bucket,
                  region: credentials.region,
                  prefix: credentials.prefix,
                });
                if (revision !== epoch.current) return;
                await onEnroll({
                  approval,
                  password: unlockPassword,
                  deviceName,
                  duration,
                  credentials,
                });
                if (revision !== epoch.current) return;
                setUnlockPassword("");
                setCredentials((current) => ({
                  ...current,
                  accessKeyId: "",
                  secretAccessKey: "",
                }));
              },
              approvalVerified
                ? "Could not connect this device. Check its S3 access keys and allow browser storage access."
                : "Could not verify this approval. Use the matching approval and the password for this browser.",
            );
          }}
        >
          <GuidancePanel title="Return to the browser that made the request">
            <p>
              The request is protected by the password for this browser. An
              approval cannot connect a different browser or browser profile.
            </p>
          </GuidancePanel>
          <fieldset disabled={working} className="space-y-6">
            <TransferInput
              label="Device approval"
              fileLabel="Choose approval file"
              value={approval}
              onChange={(text) => {
                setApproval(text);
                invalidateApproval();
              }}
              onFile={(value) => void file(value)}
              state={
                approvalVerified
                  ? "ready"
                  : working
                    ? "validating"
                    : approval
                      ? "selected"
                      : "empty"
              }
            />
            <PasswordField
              label="Password for this browser"
              value={unlockPassword}
              onChange={(value) => {
                setUnlockPassword(value);
                invalidateApproval();
              }}
              revealed={revealed}
              onRevealChange={setRevealed}
              autoComplete="current-password"
            />
            {!request ? (
              <>
                <TextField
                  label="Device name"
                  value={deviceName}
                  maxLength={80}
                  required
                  onChange={(event) => setDeviceName(event.target.value)}
                />
                <LockDurationField
                  value={duration}
                  onChange={setDuration}
                  options={vaultLockOptions}
                  description="Time since unlocking, including while you save recovery words."
                />
              </>
            ) : null}
            {approvalVerified ? (
              <section
                ref={storageSection}
                tabIndex={-1}
                data-focus-target
                className="space-y-5 rounded-lg border p-5 outline-none"
                aria-label="S3 access for this browser"
              >
                <h2 className="text-lg font-semibold">
                  S3 access for this browser
                </h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {(["bucket", "region", "prefix"] as const).map((key) => (
                    <div key={key} className="min-w-0 space-y-1">
                      <dt className="text-sm text-muted-foreground">
                        {
                          {
                            bucket: "Bucket",
                            region: "Region",
                            prefix: "Object prefix",
                          }[key]
                        }
                      </dt>
                      <dd className="break-all">
                        {credentials[key] || "Bucket root"}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-sm leading-6 text-muted-foreground">
                  Use this browser's S3 access keys. They stay encrypted on this
                  browser.
                </p>
                <TextField
                  label="Access key ID"
                  name="enrollment-s3-access-key-id"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={credentials.accessKeyId}
                  required
                  onChange={(event) =>
                    setCredentials((current) => ({
                      ...current,
                      accessKeyId: event.target.value,
                    }))
                  }
                />
                <PasswordField
                  label="Secret access key"
                  name="enrollment-s3-secret-access-key"
                  autoComplete="off"
                  value={credentials.secretAccessKey}
                  onChange={(value) =>
                    setCredentials((current) => ({
                      ...current,
                      secretAccessKey: value,
                    }))
                  }
                  revealed={secretRevealed}
                  onRevealChange={setSecretRevealed}
                />
              </section>
            ) : null}
            <div className="flex flex-wrap justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRevealed(false);
                  setSecretRevealed(false);
                  setStep(request ? "request" : "identity");
                }}
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={
                  !approval.trim() ||
                  !unlockPassword ||
                  !deviceName.trim() ||
                  (approvalVerified &&
                    (!credentials.accessKeyId.trim() ||
                      !credentials.secretAccessKey))
                }
              >
                {approvalVerified
                  ? working
                    ? "Connecting…"
                    : "Connect vault"
                  : working
                    ? "Verifying…"
                    : "Verify approval"}
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}
    </section>
  );
}
