import { PopupWorkspaceExample } from "./popup-workspace.example";
import { WorkspaceExample } from "./workspace.example";
import { galleryWorkspace, type WorkspaceScenario } from "./workspace-fixture";
import { S3SetupGuide } from "@/ui/features/sync/s3-setup-guide.view";
import { SyncPage } from "@/ui/features/sync/sync-page.view";
import { CredentialForm } from "@/ui/features/sync/credential-form.view";
import { emptyCredentials } from "@/ui/features/sync/sync.type";
import { gallerySync, type SyncScenario } from "./sync-fixture";
import { ThemeToggle } from "@/ui/features/theme";
import { VaultLockSettings } from "@/ui/features/settings/vault-lock-settings.view";
import { SetupDevice } from "@/ui/features/vault-setup/setup-device.view";
import { SetupRecoveryView } from "@/ui/features/vault-setup/setup-recovery.view";
import { SetupVaultAccess } from "@/ui/features/vault-setup/setup-vault-access.view";
import { gallerySetup, setupRecovery, setupVault } from "./setup-fixture";
import { useCallback, useRef, useState } from "react";
import { CheckPasswordStrengthUseCase } from "@lfspm/core";
import { OptionsView } from "@/ui/entrypoints/options/options.view";
import { PopupView } from "@/ui/entrypoints/popup/popup.view";
import { Specimen, Scenario } from "./specimen.view";
const strength = new CheckPasswordStrengthUseCase();
export type OptionsScenario =
  | "popup-ready"
  | "popup-empty"
  | "popup-locked"
  | "popup-multiple"
  | "popup-incomplete"
  | "popup-error"
  | WorkspaceScenario
  | "s3-guide"
  | "s3-copy-error"
  | "s3-invalid-bucket"
  | "s3-invalid-prefix"
  | "s3-invalid-origin"
  | "s3-firefox-origin"
  | SyncScenario
  | "appearance"
  | "lock-settings"
  | "lock-settings-pending"
  | "lock-settings-error"
  | "recovery"
  | "verification"
  | "verification-error"
  | "verification-pending"
  | "export-error"
  | "creation-pending"
  | "creation-error"
  | "unlock-pending"
  | "unlock-error"
  | "replacement-pending"
  | "locked"
  | "backup-incomplete"
  | "complete"
  | "welcome"
  | "password"
  | "password-pending"
  | "password-unavailable"
  | "device"
  | "connect"
  | "multiple-vaults"
  | "existing"
  | "loading"
  | "error";
export function OptionsExample({
  state,
  preference,
  onThemeChange,
}: {
  state: OptionsScenario;
  preference: "light" | "dark" | "system";
  onThemeChange: (preference: "light" | "dark" | "system") => void;
}) {
  const [workspace] = useState(() => galleryWorkspace());
  const [sync] = useState(() =>
    gallerySync(
      state.startsWith("sync-") ? (state as SyncScenario) : "sync-setup",
    ),
  );
  const [s3Location, setS3Location] = useState({
    bucket: state === "s3-invalid-bucket" ? "" : "personal-vault",
    region: "eu-central-1",
    prefix: state === "s3-invalid-prefix" ? "" : "vault/",
  });
  const [guideDone, setGuideDone] = useState(false);
  const [connection, setConnection] = useState(emptyCredentials);
  const [savedDuration, setSavedDuration] = useState(600_000);
  const failed = useRef(false);
  const [setup] = useState(() =>
    gallerySetup(
      state === "multiple-vaults"
        ? "multiple"
        : state === "existing" || state === "loading" || state === "error"
          ? state
          : "empty",
    ),
  );
  const [verification, setVerification] = useState(
    state.startsWith("verification"),
  );
  const [notice, setNotice] = useState("");
  const assessPassword = useCallback(
    async (password: string) => {
      if (state === "password-pending")
        return new Promise<{ score: 0 | 1 | 2 | 3 | 4 }>(() => {});
      if (state === "password-unavailable" && !failed.current) {
        failed.current = true;
        throw new Error("Assessment unavailable");
      }
      return strength.execute({ password });
    },
    [state],
  );
  if (state.startsWith("popup-"))
    return (
      <PopupWorkspaceExample
        key={state}
        state={
          state.slice(6) as
            | "ready"
            | "empty"
            | "locked"
            | "multiple"
            | "incomplete"
            | "error"
        }
      />
    );
  if (state.startsWith("workspace") || state === "complete")
    return (
      <WorkspaceExample
        key={state}
        state={
          state === "complete" ? "workspace" : (state as WorkspaceScenario)
        }
      />
    );
  if (state.startsWith("s3-"))
    return guideDone ? (
      <div className="max-w-xl space-y-4">
        <CredentialForm
          value={connection}
          onChange={setConnection}
          onCancel={() => setGuideDone(false)}
          onSubmit={() => setNotice("Sync enabled")}
          onTest={() => setNotice("Access confirmed")}
        />
        {notice ? <p role="status">{notice}</p> : null}
      </div>
    ) : (
      <S3SetupGuide
        origin={
          state === "s3-invalid-origin"
            ? "https://example.com"
            : state === "s3-firefox-origin"
              ? "moz-extension://2c127fa4-62c7-7e4f-90e5-472b45eecfdc"
              : sync.origin
        }
        location={s3Location}
        onLocationChange={setS3Location}
        onCopy={async () => {
          if (state === "s3-copy-error")
            throw new Error("Clipboard unavailable");
        }}
        onContinue={() => {
          setConnection({ ...emptyCredentials, ...s3Location });
          setGuideDone(true);
        }}
      />
    );
  if (state.startsWith("sync-"))
    return (
      <SyncPage
        vaultId="gallery-vault"
        capabilities={sync}
        onBack={() => setNotice("Back requested")}
      />
    );
  if (state === "appearance")
    return (
      <section className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Appearance</h1>
        <ThemeToggle preference={preference} onThemeChange={onThemeChange} />
      </section>
    );
  if (state.startsWith("lock-settings"))
    return (
      <VaultLockSettings
        key={savedDuration}
        duration={savedDuration}
        pending={state === "lock-settings-pending"}
        error={
          state === "lock-settings-error"
            ? "Could not save the lock setting. Try again."
            : undefined
        }
        onSave={setSavedDuration}
      />
    );
  if (state === "creation-pending" || state === "creation-error")
    return (
      <SetupDevice
        name="This browser"
        onNameChange={() => {}}
        duration={600_000}
        onDurationChange={() => {}}
        onBack={() => setNotice("Back requested")}
        onFinish={() => setNotice("Creation requested")}
        pending={state === "creation-pending"}
        error={
          state === "creation-error"
            ? "Could not create the vault. Try again."
            : notice || undefined
        }
      />
    );
  if (
    [
      "recovery",
      "verification",
      "verification-error",
      "verification-pending",
      "export-error",
    ].includes(state)
  )
    return (
      <SetupRecoveryView
        recovery={setupRecovery}
        verifying={verification}
        pending={state === "verification-pending"}
        error={
          state === "verification-error"
            ? "The words do not match. Check your saved copy."
            : notice || undefined
        }
        onContinue={() => setVerification(true)}
        onReview={() => setVerification(false)}
        onVerify={() => setNotice("Verification requested")}
        onSave={async () => {
          if (state === "export-error")
            throw new Error("Synthetic export failure");
        }}
        onLock={() => setNotice("Lock requested")}
      />
    );
  if (
    [
      "locked",
      "backup-incomplete",
      "unlock-pending",
      "unlock-error",
      "replacement-pending",
    ].includes(state)
  )
    return (
      <SetupVaultAccess
        vault={{
          ...setupVault,
          unlocked: !["locked", "unlock-pending", "unlock-error"].includes(
            state,
          ),
          complete: false,
        }}
        pending={state === "unlock-pending" || state === "replacement-pending"}
        error={
          state === "unlock-error"
            ? "Could not unlock this vault. Check your password."
            : notice || undefined
        }
        onUnlock={() => setNotice("Unlock requested")}
        onReplace={() => setNotice("Replacement requested")}
        onLock={() => setNotice("Lock requested")}
      />
    );
  return (
    <OptionsView
      workspace={workspace}
      setup={setup}
      sync={sync}
      preference={preference}
      onThemeChange={onThemeChange}
      initialStep={
        state === "password-pending" || state === "password-unavailable"
          ? "password"
          : state === "welcome" ||
              state === "password" ||
              state === "device" ||
              state === "connect"
            ? state
            : "welcome"
      }
      assessPassword={assessPassword}
    />
  );
}
export function ScreenExamples() {
  const [preference, setPreference] = useState<"light" | "dark" | "system">(
    "system",
  );
  const [action, setAction] = useState("");
  return (
    <div className="space-y-8">
      <Specimen id="S04" name="S3SetupGuide" owner="features/sync" wide>
        <Scenario
          label="S3 setup guide"
          options={
            [
              "s3-guide",
              "s3-copy-error",
              "s3-invalid-bucket",
              "s3-invalid-prefix",
              "s3-invalid-origin",
              "s3-firefox-origin",
            ] as const
          }
        >
          {(state) => (
            <OptionsExample
              state={state}
              preference={preference}
              onThemeChange={setPreference}
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen id="S03" name="SyncPage" owner="features/sync" wide>
        <Scenario
          label="Sync screen"
          options={
            [
              "sync-setup",
              "sync-access-pending",
              "sync-saved-refresh-error",
              "sync-configured",
              "sync-pending",
              "sync-error",
              "sync-session-expired",
              "sync-review",
              "sync-revision",
              "sync-repair-error",
              "sync-loading",
            ] as const
          }
        >
          {(state) => (
            <OptionsExample
              state={state}
              preference={preference}
              onThemeChange={setPreference}
            />
          )}
        </Scenario>
      </Specimen>
      <Specimen id="S01" name="PopupView" owner="entrypoints/popup">
        <Scenario
          label="Vault quick access"
          options={
            [
              "ready",
              "empty",
              "locked",
              "multiple",
              "incomplete",
              "error",
            ] as const
          }
        >
          {(state) => <PopupWorkspaceExample key={state} state={state} />}
        </Scenario>
        <Scenario
          label="First-launch popup"
          options={
            ["empty", "existing", "loading", "error", "open-error"] as const
          }
        >
          {(state) => (
            <PopupView
              availability={state === "open-error" ? "empty" : state}
              onRetry={() => setAction("Retry requested")}
              onOpenOptions={async () => {
                if (state === "open-error")
                  throw new Error("Synthetic opening failure");
                setAction("Options opening requested");
              }}
            />
          )}
        </Scenario>
        {action ? (
          <p role="status" className="text-xs text-muted-foreground">
            {action}
          </p>
        ) : null}
      </Specimen>
      <Specimen
        id="S02"
        name="OptionsView"
        owner="entrypoints/options · vault-setup"
        wide
      >
        <Scenario
          label="First-launch options"
          options={
            [
              "welcome",
              "password",
              "password-pending",
              "password-unavailable",
              "device",
              "connect",
              "recovery",
              "verification",
              "verification-error",
              "verification-pending",
              "export-error",
              "creation-pending",
              "creation-error",
              "unlock-pending",
              "unlock-error",
              "replacement-pending",
              "locked",
              "workspace",
              "workspace-empty",
              "workspace-loading",
              "workspace-error",
              "workspace-stale",
              "workspace-uploaded",
              "workspace-pending-upload",
              "workspace-saved-refresh-error",
              "backup-incomplete",
              "appearance",
              "lock-settings",
              "lock-settings-pending",
              "lock-settings-error",
              "existing",
              "multiple-vaults",
              "loading",
              "error",
            ] as const
          }
        >
          {(state) => (
            <OptionsExample
              state={state}
              preference={preference}
              onThemeChange={setPreference}
            />
          )}
        </Scenario>
      </Specimen>
    </div>
  );
}
