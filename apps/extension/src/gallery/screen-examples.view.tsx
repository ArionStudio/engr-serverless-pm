import { PopupWorkspaceExample } from "./popup-workspace.example";
import { WorkspaceExample } from "./workspace.example";
import { galleryWorkspace, type WorkspaceScenario } from "./workspace-fixture";
import { S3SetupGuide } from "@/ui/features/sync/s3-setup-guide.view";
import { SyncStatus } from "@/ui/features/sync/sync-review.view";
import { SyncPage } from "@/ui/features/sync/sync-page.view";
import { CredentialForm } from "@/ui/features/sync/credential-form.view";
import { emptyCredentials } from "@/ui/features/sync/sync.type";
import { gallerySync, type SyncScenario } from "./sync-fixture";
import { ThemeToggle } from "@/ui/features/theme";
import { VaultLockSettings } from "@/ui/features/settings/vault-lock-settings.view";
import { SetupDevice } from "@/ui/features/vault-setup/setup-device.view";
import { SetupRecoveryView } from "@/ui/features/vault-setup/setup-recovery.view";
import { RecoverVaultAccess } from "@/ui/features/vault-setup/recover-vault-access.view";
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
  | SyncScenario
  | "appearance"
  | "lock-settings"
  | "lock-settings-pending"
  | "lock-settings-error"
  | "recover-access"
  | "recover-access-pending"
  | "recover-access-error"
  | "recovered-words"
  | "recovered-verification"
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
  const [connection, setConnection] = useState({
    ...emptyCredentials,
    bucket: state === "s3-invalid-bucket" ? "" : "personal-vault",
    region: "eu-central-1",
    prefix: state === "s3-invalid-prefix" ? "" : "vault/",
  });
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
    state.startsWith("verification") || state === "recovered-verification",
  );
  const [notice, setNotice] = useState(
    state === "unlock-error"
      ? "Could not unlock this vault. Check your password."
      : "",
  );
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
  if (state.startsWith("recover-access"))
    return (
      <RecoverVaultAccess
        vaultName={setupVault.name}
        pending={state === "recover-access-pending"}
        error={
          state === "recover-access-error"
            ? "Could not recover this vault. The recovery words or saved local data could not be verified. Check all 24 words and their order against the latest copy saved for this browser. If they match, keep the local vault data and use another enrolled device if available."
            : notice || undefined
        }
        assessPassword={assessPassword}
        onRecover={() => setNotice("Recovery requested")}
        onBack={() => setNotice("Back to unlock requested")}
      />
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
    return (
      <S3SetupGuide
        location={{
          bucket: connection.bucket,
          region: connection.region,
          prefix: connection.prefix,
        }}
        onLocationChange={(location) => {
          setConnection({ ...connection, ...location });
          setNotice("");
        }}
        onCopy={async () => {
          if (state === "s3-copy-error")
            throw new Error("Clipboard unavailable");
        }}
        connection={(onEditLocation) => (
          <CredentialForm
            value={connection}
            onChange={(value) => {
              setConnection(value);
              setNotice("");
            }}
            onEditLocation={onEditLocation}
            onCancel={() => {
              setConnection({ ...emptyCredentials });
              setNotice("");
            }}
            onSubmit={() => setNotice("Sync enabled")}
            onTest={() => setNotice("Read access confirmed.")}
            feedback={
              notice ? (
                <SyncStatus
                  state={
                    notice === "Sync enabled" ? "complete" : "access-confirmed"
                  }
                  detail={
                    notice === "Sync enabled"
                      ? "The encrypted vault is up to date in S3."
                      : "Your keys can read this storage location. Upload permission will be checked when you enable sync."
                  }
                />
              ) : undefined
            }
          />
        )}
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
      "recovered-words",
      "recovered-verification",
      "verification",
      "verification-error",
      "verification-pending",
      "export-error",
    ].includes(state)
  )
    return (
      <SetupRecoveryView
        recovery={
          state.startsWith("recovered-")
            ? { ...setupRecovery, purpose: "password-recovery" }
            : setupRecovery
        }
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
        error={notice || undefined}
        assessPassword={assessPassword}
        onRecover={() => setNotice("Recovery requested")}
        onDismissError={() => setNotice("")}
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
              "sync-permission",
              "sync-permission-error",
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
              "recover-access",
              "recover-access-pending",
              "recover-access-error",
              "recovered-words",
              "recovered-verification",
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
