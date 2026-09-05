import { VaultLockSettings } from "@/ui/features/settings/vault-lock-settings.view";
import { SetupRecoveryView } from "@/ui/features/vault-setup/setup-recovery.view";
import { SetupVaultAccess } from "@/ui/features/vault-setup/setup-vault-access.view";
import { useVaultSetup } from "@/ui/features/vault-setup/use-vault-setup";
import type { SetupCapabilities } from "@/ui/features/vault-setup/setup.type";
import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SecurityCheckIcon } from "@hugeicons/core-free-icons";
import { ThemeToggle } from "@/ui/features/theme";
import {
  SetupWelcome,
  SetupPassword,
  SetupDevice,
  SetupConnection,
  type SetupStep,
  type AssessPassword,
  type PasswordCreationDraft,
} from "@/ui/features/vault-setup";
import { Button } from "@/ui/components/primitives/button";
import { cn } from "@/ui/lib/cn.util";
import { Spinner } from "@/ui/components/primitives/spinner";
import { StepNavigation } from "@/ui/components/layout/sections.view";
import type { VaultAvailability } from "../first-launch.type";

export function OptionsView({
  preference,
  onThemeChange,
  availability,
  onRetry,
  assessPassword,
  initialStep = "welcome",
  setup,
}: {
  preference: "light" | "dark" | "system";
  onThemeChange: (preference: "light" | "dark" | "system") => void;
  availability: VaultAvailability;
  onRetry: () => void;
  assessPassword: AssessPassword;
  initialStep?: SetupStep;
  setup: SetupCapabilities;
}) {
  const live = useVaultSetup(setup);
  const [step, setStep] = useState<SetupStep>(initialStep);
  const [settings, setSettings] = useState(false);
  const [draft, setDraft] = useState<PasswordCreationDraft>({
    password: "",
    confirmation: "",
  });
  const [name, setName] = useState("This browser");
  const [duration, setDuration] = useState(600_000);
  const content = useRef<HTMLDivElement>(null);
  const initialFocus = useRef(true);
  useEffect(() => {
    if (initialFocus.current) {
      initialFocus.current = false;
      return;
    }
    content.current?.focus();
  }, [
    step,
    settings,
    availability,
    live.recovery,
    live.verifying,
    live.vault?.vaultId,
    live.vault?.unlocked,
    live.vault?.complete,
  ]);
  function reset() {
    setDraft({ password: "", confirmation: "" });
    setName("This browser");
    setDuration(600_000);
    setStep("welcome");
  }
  function showSettings() {
    reset();
    setSettings(true);
  }
  const creating = step === "password" || step === "device";
  return (
    <div className="@container bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <HugeiconsIcon
              icon={SecurityCheckIcon}
              size={20}
              className="text-primary"
              aria-hidden="true"
            />
            LFSPM
          </span>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              disabled={live.pending || !!live.recovery}
              onClick={settings ? () => setSettings(false) : showSettings}
            >
              {settings
                ? live.vault
                  ? "Back to vault"
                  : "Back to setup"
                : live.vault?.complete
                  ? "Settings"
                  : "Appearance"}
            </Button>
          </div>
        </div>
      </header>
      <main
        className={cn(
          "mx-auto space-y-8 px-5 py-8 @lg:py-12",
          !settings &&
            !live.vault &&
            availability === "empty" &&
            step === "welcome"
            ? "max-w-4xl"
            : "max-w-xl",
        )}
      >
        <div ref={content} tabIndex={-1} className="outline-none">
          {settings ? (
            <section className="space-y-6">
              <h1 className="text-2xl font-semibold tracking-tight">
                {live.vault?.complete ? "Settings" : "Appearance"}
              </h1>
              {live.vault?.complete ? (
                <VaultLockSettings
                  key={`${live.vault.vaultId}:${live.vault.duration}`}
                  duration={live.vault.duration}
                  pending={live.pending}
                  error={live.error}
                  onSave={(duration) => {
                    void live.saveDuration(duration);
                  }}
                />
              ) : null}
              {live.vault?.complete ? (
                <h2 className="text-lg font-semibold">Appearance</h2>
              ) : null}
              <ThemeToggle
                preference={preference}
                onThemeChange={onThemeChange}
              />
            </section>
          ) : live.recovery ? (
            <SetupRecoveryView
              key={live.recovery.vault.vaultId}
              recovery={live.recovery}
              verifying={live.verifying}
              pending={live.pending}
              error={live.error}
              onVerify={(answers) => {
                void live.verify(answers);
              }}
              onSave={live.save}
              onContinue={live.continue}
              onReview={live.review}
              onLock={() => {
                void live.lock();
              }}
            />
          ) : live.vault ? (
            <SetupVaultAccess
              key={`${live.vault.vaultId}:${live.vault.unlocked}`}
              vault={live.vault}
              pending={live.pending}
              error={live.error}
              onUnlock={(password) => {
                void live.unlock(password);
              }}
              onReplace={() => {
                void live.replace();
              }}
              onLock={() => {
                void live.lock();
              }}
            />
          ) : availability === "loading" || live.loading ? (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Spinner />
              Checking this browser…
            </p>
          ) : availability === "error" ? (
            <section className="space-y-6">
              <h1 className="text-2xl font-semibold tracking-tight">
                Couldn’t check local vaults
              </h1>
              <Button onClick={onRetry}>Try again</Button>
            </section>
          ) : availability === "existing" ? (
            <section className="space-y-6">
              <h1 className="text-2xl font-semibold tracking-tight">
                Local vault found
              </h1>
              <Button variant="outline" onClick={showSettings}>
                Change appearance
              </Button>
            </section>
          ) : (
            <>
              {creating ? (
                <div className="mb-8 space-y-4">
                  <StepNavigation
                    currentId={step}
                    onNavigate={(id) => {
                      if (id === "password" && !live.pending)
                        setStep("password");
                    }}
                    steps={[
                      {
                        id: "password",
                        label: "Password",
                        state: step === "device" ? "complete" : "upcoming",
                        allowed: true,
                      },
                      {
                        id: "device",
                        label: "Device",
                        state: "upcoming",
                        allowed: step === "device",
                      },
                      {
                        id: "recovery",
                        label: "Recovery",
                        state: "upcoming",
                        allowed: false,
                      },
                      {
                        id: "verify",
                        label: "Verification",
                        state: "upcoming",
                        allowed: false,
                      },
                    ]}
                  />
                </div>
              ) : null}
              {step === "welcome" ? (
                <SetupWelcome
                  onCreate={() => {
                    setStep("password");
                  }}
                  onConnect={() => {
                    setStep("connect");
                  }}
                />
              ) : step === "connect" ? (
                <SetupConnection onBack={reset} />
              ) : step === "password" ? (
                <>
                  {live.error ? (
                    <p role="alert" className="mb-5 text-sm text-destructive">
                      {live.error}
                    </p>
                  ) : null}
                  <SetupPassword
                    value={draft}
                    onChange={setDraft}
                    onContinue={() => setStep("device")}
                    onBack={reset}
                    assessPassword={assessPassword}
                  />
                </>
              ) : (
                <SetupDevice
                  name={name}
                  onNameChange={setName}
                  duration={duration}
                  onDurationChange={setDuration}
                  onBack={() => setStep("password")}
                  pending={live.pending}
                  error={live.error}
                  onFinish={() => {
                    const password = draft.password;
                    setDraft({ password: "", confirmation: "" });
                    void live
                      .create({ password, deviceName: name, duration })
                      .then(() => setStep("password"));
                  }}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
