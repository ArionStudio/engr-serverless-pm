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
  | "existing"
  | "loading"
  | "error";
export function OptionsExample({
  state,
  preference,
  onThemeChange,
  onRetry,
}: {
  state: OptionsScenario;
  preference: "light" | "dark" | "system";
  onThemeChange: (preference: "light" | "dark" | "system") => void;
  onRetry: () => void;
}) {
  const [savedDuration, setSavedDuration] = useState(600_000);
  const failed = useRef(false);
  const [setup] = useState(gallerySetup);
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
      "complete",
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
          complete: state === "complete",
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
      setup={setup}
      preference={preference}
      onThemeChange={onThemeChange}
      availability={
        state === "existing" || state === "loading" || state === "error"
          ? state
          : "empty"
      }
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
      onRetry={onRetry}
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
      <Specimen id="S01" name="PopupView" owner="entrypoints/popup">
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
              "backup-incomplete",
              "complete",
              "appearance",
              "lock-settings",
              "lock-settings-pending",
              "lock-settings-error",
              "existing",
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
              onRetry={() => setAction("Retry requested")}
            />
          )}
        </Scenario>
      </Specimen>
    </div>
  );
}
