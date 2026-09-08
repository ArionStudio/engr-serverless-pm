import { EntryWorkspace } from "@/ui/features/entries/entry-workspace.view";
import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";
import { SyncPage } from "@/ui/features/sync/sync-page.view";
import type { SyncCapabilities } from "@/ui/features/sync/sync.type";
import { VaultPicker } from "@/ui/features/vault-access";
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

export function OptionsView({
  preference,
  onThemeChange,
  assessPassword,
  initialStep = "welcome",
  setup,
  sync,
  workspace,
}: {
  preference: "light" | "dark" | "system";
  onThemeChange: (preference: "light" | "dark" | "system") => void;
  assessPassword: AssessPassword;
  initialStep?: SetupStep;
  setup: SetupCapabilities;
  sync: SyncCapabilities;
  workspace: WorkspaceCapabilities;
}) {
  const live = useVaultSetup(setup);
  const [step, setStep] = useState<SetupStep>(initialStep);
  const [showSync, setShowSync] = useState(false);
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
    showSync,
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
    setShowSync(false);
    setSettings(true);
  }
  const creating = step === "password" || step === "device";
  return (
    <div className="@container bg-background text-foreground">
      <header className="border-b">
        <div
          className={cn(
            "mx-auto flex flex-wrap items-center justify-between gap-3 px-5 py-4",
            live.vault?.complete &&
              live.vault.unlocked &&
              !settings &&
              !showSync
              ? "max-w-6xl"
              : "max-w-4xl",
          )}
        >
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
            {live.vault?.complete && live.vault.unlocked ? (
              <Button
                variant={showSync ? "secondary" : "ghost"}
                onClick={() => {
                  setSettings(false);
                  setShowSync(true);
                }}
              >
                Sync
              </Button>
            ) : null}
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
          !settings && live.vault?.complete && live.vault.unlocked
            ? "max-w-6xl"
            : !settings &&
                !live.vault &&
                live.vaults.length === 0 &&
                step === "welcome"
              ? "max-w-4xl"
              : "max-w-xl",
        )}
      >
        {!settings &&
        !live.recovery &&
        !live.vault?.unlocked &&
        live.vaults.length > 0 ? (
          <VaultPicker
            vaults={live.vaults.map(({ vaultId, name }) => ({
              id: vaultId,
              name,
              deviceLabel: "This browser",
            }))}
            value={live.vault?.vaultId ?? null}
            loading={live.pending}
            onChange={(vaultId) => {
              void live.selectVault(vaultId);
            }}
          />
        ) : null}
        <div
          ref={content}
          tabIndex={-1}
          data-focus-target
          className="outline-none"
        >
          {!live.vault && live.error ? (
            <p role="alert" className="mb-5 text-sm text-destructive">
              {live.error}
            </p>
          ) : null}
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
          ) : showSync && live.vault?.complete && live.vault.unlocked ? (
            <SyncPage
              key={live.vault.vaultId}
              vaultId={live.vault.vaultId}
              capabilities={sync}
              onBack={() => setShowSync(false)}
            />
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
          ) : live.vault?.complete && live.vault.unlocked ? (
            <>
              {live.error ? (
                <p role="alert" className="mb-5 text-sm text-destructive">
                  {live.error}
                </p>
              ) : null}
              <EntryWorkspace
                key={live.vault.vaultId}
                vaultId={live.vault.vaultId}
                capabilities={workspace}
                onSessionLost={live.retry}
                onLock={live.lock}
                onSync={() => setShowSync(true)}
              />
            </>
          ) : live.vault ? (
            <SetupVaultAccess
              key={`${live.vault.vaultId}:${live.vault.unlocked}:${live.draftRevision}`}
              vault={live.vault}
              pending={live.pending}
              error={live.error}
              assessPassword={assessPassword}
              onRecover={(words, password) => {
                setShowSync(false);
                void live.recover(words, password);
              }}
              onDismissError={live.dismissError}
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
          ) : live.loading ? (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Spinner />
              Checking this browser…
            </p>
          ) : live.inspectionFailed ? (
            <section className="space-y-6">
              <h1 className="text-2xl font-semibold tracking-tight">
                Couldn’t check local vaults
              </h1>
              <Button
                onClick={() => {
                  void live.retry();
                }}
              >
                Try again
              </Button>
            </section>
          ) : live.vaults.length > 0 ? (
            <section className="space-y-6">
              <h1 className="text-2xl font-semibold tracking-tight">
                Choose a vault
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
