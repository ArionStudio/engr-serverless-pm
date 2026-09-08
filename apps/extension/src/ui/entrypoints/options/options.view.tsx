import { VaultApplication } from "./vault-application.view";
import type { DeviceCapabilities } from "@/ui/features/devices/device-management.type";
import type { VaultSettingsCapabilities } from "@/ui/features/settings/settings.type";
import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";
import type { SyncCapabilities } from "@/ui/features/sync/sync.type";
import { VaultPicker } from "@/ui/features/vault-access";
import { SetupRecoveryView } from "@/ui/features/vault-setup/setup-recovery.view";
import { SetupVaultAccess } from "@/ui/features/vault-setup/setup-vault-access.view";
import { useVaultSetup } from "@/ui/features/vault-setup/use-vault-setup";
import type { SetupCapabilities } from "@/ui/features/vault-setup/setup.type";
import { useCallback, useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SecurityCheckIcon } from "@hugeicons/core-free-icons";
import { ThemeToggle } from "@/ui/features/theme";
import {
  SetupWelcome,
  SetupPassword,
  SetupDevice,
  SetupConnection,
  SetupOrganization,
  createOrganizationSetupDraft,
  type SetupStep,
  type AssessPassword,
  type PasswordCreationDraft,
  type OrganizationSetupDraft,
} from "@/ui/features/vault-setup";
import type { GlobalLibrary } from "@lfspm/core";
import { Button } from "@/ui/components/primitives/button";
import { cn } from "@/ui/lib/cn.util";
import { Spinner } from "@/ui/components/primitives/spinner";
import { StepNavigation } from "@/ui/components/layout/sections.view";
import type { EntryDraft } from "@/ui/features/entries/entry-form.view";
import type { VaultDestination } from "./options-route";
import type { TagManagementCapabilities } from "@/ui/features/tags";
import type { FolderManagementCapabilities } from "@/ui/features/folders";

export function OptionsView({
  preference,
  onThemeChange,
  assessPassword,
  initialStep = "welcome",
  setup,
  sync,
  workspace,
  tagManagement,
  folderManagement,
  devices,
  vaultSettings,
  initialDestination,
  routeRequestId = 0,
  initialEntryDraft,
  initialRecovery = false,
  onExitRecovery,
}: {
  preference: "light" | "dark" | "system";
  onThemeChange: (preference: "light" | "dark" | "system") => void;
  assessPassword: AssessPassword;
  initialStep?: SetupStep;
  setup: SetupCapabilities;
  sync: SyncCapabilities;
  workspace: WorkspaceCapabilities;
  tagManagement: TagManagementCapabilities;
  folderManagement: FolderManagementCapabilities;
  devices: DeviceCapabilities;
  vaultSettings: VaultSettingsCapabilities;
  initialDestination?: VaultDestination;
  routeRequestId?: number;
  initialEntryDraft?: EntryDraft;
  initialRecovery?: boolean;
  onExitRecovery?: () => void;
}) {
  const live = useVaultSetup(setup);
  const retry = live.retry;
  const handleSessionLost = useCallback(() => {
    void retry();
  }, [retry]);
  const [step, setStep] = useState<SetupStep>(initialStep);
  const [settings, setSettings] = useState(false);
  const [draft, setDraft] = useState<PasswordCreationDraft>({
    password: "",
    confirmation: "",
  });
  const [name, setName] = useState("This browser");
  const [duration, setDuration] = useState(600_000);
  const [organizationLibrary, setOrganizationLibrary] =
    useState<GlobalLibrary>();
  const [organization, setOrganization] = useState<OrganizationSetupDraft>();
  const [organizationError, setOrganizationError] = useState<string>();
  const content = useRef<HTMLDivElement>(null);
  const initialFocus = useRef(true);
  useEffect(() => {
    if (initialFocus.current) {
      initialFocus.current = false;
      return;
    }
    (document.scrollingElement ?? document.documentElement).scrollTop = 0;
    content.current?.focus({ preventScroll: true });
  }, [
    step,
    settings,
    live.recovery,
    live.verifying,
    live.vault?.vaultId,
    live.vault?.unlocked,
    live.vault?.complete,
  ]);
  useEffect(() => {
    let active = true;
    setup
      .readOrganizationLibrary()
      .then((library) => {
        if (!active) return;
        setOrganizationLibrary(library);
        setOrganization(
          (current) =>
            current ??
            createOrganizationSetupDraft(
              library,
              library.templates[0]?.id ?? null,
            ),
        );
        setOrganizationError(undefined);
      })
      .catch(() => {
        if (active)
          setOrganizationError(
            "Organization choices are unavailable. Try loading them again.",
          );
      });
    return () => {
      active = false;
    };
  }, [setup]);
  function reset() {
    setDraft({ password: "", confirmation: "" });
    setName("This browser");
    setDuration(600_000);
    if (organizationLibrary)
      setOrganization(
        createOrganizationSetupDraft(
          organizationLibrary,
          organizationLibrary.templates[0]?.id ?? null,
        ),
      );
    setStep("welcome");
  }
  function showSettings() {
    reset();
    setSettings(true);
  }
  const creating =
    step === "password" || step === "device" || step === "organization";
  return (
    <div className="@container bg-background text-foreground">
      <header className="border-b">
        <div
          className={cn(
            "mx-auto flex flex-wrap items-center justify-between gap-3 px-5 py-4",
            live.vault?.complete && live.vault.unlocked && !settings
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
            {!(live.vault?.complete && live.vault.unlocked) ? (
              <Button
                variant="ghost"
                disabled={live.pending || !!live.recovery}
                onClick={settings ? () => setSettings(false) : showSettings}
              >
                {settings
                  ? live.vault
                    ? "Back to vault"
                    : "Back to setup"
                  : "Appearance"}
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <main
        className={cn(
          "mx-auto space-y-8 px-5 py-8 @lg:py-12",
          !settings && live.vault?.complete && live.vault.unlocked
            ? "max-w-6xl"
            : !settings &&
                (Boolean(live.recovery) ||
                  (!live.vault &&
                    live.vaults.length === 0 &&
                    (step === "welcome" || step === "organization")))
              ? "max-w-4xl"
              : "max-w-2xl",
        )}
      >
        {!settings &&
        !live.recovery &&
        !live.vault?.unlocked &&
        live.vaults.length > 0 &&
        (live.vaults.length > 1 || !live.vault) ? (
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
          {live.loading ? (
            <p role="status" className="flex items-center gap-2">
              <Spinner /> Checking this browser…
            </p>
          ) : settings ? (
            <section className="space-y-6">
              <h1 className="text-2xl font-semibold tracking-tight">
                Appearance
              </h1>
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
          ) : live.vault?.complete && live.vault.unlocked ? (
            <>
              {live.error ? (
                <p role="alert" className="mb-5 text-sm text-destructive">
                  {live.error}
                </p>
              ) : null}
              <VaultApplication
                key={`${live.vault.vaultId}:${live.draftRevision}:${initialDestination ?? "entries"}:${initialEntryDraft ? "add" : "browse"}:${routeRequestId}`}
                vault={live.vault}
                workspace={workspace}
                tagManagement={tagManagement}
                folderManagement={folderManagement}
                sync={sync}
                devices={devices}
                settings={vaultSettings}
                assessPassword={assessPassword}
                initialDestination={initialDestination}
                initialEntryDraft={initialEntryDraft}
                appearance={
                  <ThemeToggle
                    preference={preference}
                    onThemeChange={onThemeChange}
                  />
                }
                onLock={live.lock}
                onReplaceRecovery={() => {
                  void live.replaceRecoveryWords();
                }}
                onDeleted={() => {
                  reset();
                  void live.retry();
                }}
                onRefresh={(clearDraft) => {
                  void live.retry(clearDraft);
                }}
                onSessionLost={handleSessionLost}
              />
            </>
          ) : live.vault ? (
            <SetupVaultAccess
              key={`${live.vault.vaultId}:${live.vault.unlocked}:${live.draftRevision}:${initialRecovery}`}
              vault={live.vault}
              pending={live.pending}
              error={live.error}
              initiallyRecovering={initialRecovery}
              onExitRecovery={onExitRecovery}
              assessPassword={assessPassword}
              onRecover={(words, password) => {
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
                      if (live.pending) return;
                      if (id === "password") setStep("password");
                      if (id === "device" && step === "organization")
                        setStep("device");
                    }}
                    steps={[
                      {
                        id: "password",
                        label: "Password",
                        state:
                          step === "device" || step === "organization"
                            ? "complete"
                            : "upcoming",
                        allowed: !live.pending,
                      },
                      {
                        id: "device",
                        label: "Device",
                        state:
                          step === "organization" ? "complete" : "upcoming",
                        allowed:
                          !live.pending &&
                          (step === "device" || step === "organization"),
                      },
                      {
                        id: "organization",
                        label: "Organization",
                        state: "upcoming",
                        allowed: !live.pending && step === "organization",
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
                <SetupConnection
                  capabilities={devices}
                  assessPassword={assessPassword}
                  pending={live.pending}
                  error={live.error}
                  onEnroll={live.enroll}
                  onBack={reset}
                />
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
              ) : step === "device" ? (
                <SetupDevice
                  name={name}
                  onNameChange={setName}
                  duration={duration}
                  onDurationChange={setDuration}
                  onBack={() => setStep("password")}
                  pending={live.pending}
                  error={live.error}
                  onFinish={() => setStep("organization")}
                />
              ) : organizationLibrary && organization ? (
                <SetupOrganization
                  library={organizationLibrary}
                  pending={live.pending}
                  error={live.error}
                  value={organization}
                  onChange={setOrganization}
                  onBack={() => setStep("device")}
                  onContinue={() => {
                    const password = draft.password;
                    setDraft({ password: "", confirmation: "" });
                    void live
                      .create({
                        password,
                        deviceName: name,
                        duration,
                        organization: {
                          folders: organization.folders,
                          tags: organization.tags,
                        },
                      })
                      .then(() => setStep("password"));
                  }}
                />
              ) : (
                <section className="space-y-5">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    Organize your vault
                  </h1>
                  {organizationError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {organizationError}
                    </p>
                  ) : (
                    <p
                      role="status"
                      className="flex items-center gap-2 text-sm"
                    >
                      <Spinner /> Loading organization choices…
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setStep("device")}>
                      Back to device
                    </Button>
                    {organizationError ? (
                      <Button
                        onClick={() => {
                          setOrganizationError(undefined);
                          void setup
                            .readOrganizationLibrary()
                            .then((library) => {
                              setOrganizationLibrary(library);
                              setOrganization(
                                createOrganizationSetupDraft(
                                  library,
                                  library.templates[0]?.id ?? null,
                                ),
                              );
                            })
                            .catch(() =>
                              setOrganizationError(
                                "Organization choices are unavailable. Try loading them again.",
                              ),
                            );
                        }}
                      >
                        Try again
                      </Button>
                    ) : null}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
