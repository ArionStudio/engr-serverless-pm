import { PopupSync } from "./popup-sync.view";
import type { PopupSyncCapabilities } from "./popup-sync.type";
import { PopupSettings } from "./popup-settings.view";
import type { VaultSettingsCapabilities } from "@/ui/features/settings/settings.type";
import type { BrowserLoginCapabilities } from "@/ui/features/entries/browser-login.type";
import { useCallback, useRef, useState } from "react";
import type {
  WorkspaceCapabilities,
  WorkspaceControls,
} from "@/ui/features/entries/workspace.type";
import type { EntryDraft } from "@/ui/features/entries/entry-form.view";
import { emptyEntryDraft } from "@/ui/features/entries/entry-draft";
import type { SetupCapabilities } from "@/ui/features/vault-setup/setup.type";
import { useVaultSetup } from "@/ui/features/vault-setup/use-vault-setup";
import { PasswordToolsPage } from "@/ui/features/password-tools/password-tools-page.view";
import { Button } from "@/ui/components/primitives/button";
import { PopupView } from "./popup.view";
import { PopupEntries } from "./popup-entries.view";
import { PopupVaultAccess } from "./popup-vault-access.view";
import type { OptionsRoute } from "../options/options-route";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Search01Icon,
  ArrowUpRight01Icon,
  Key01Icon,
  LockKeyholeIcon,
  Settings01Icon,
  VaultIcon,
} from "@hugeicons/core-free-icons";

export type PopupRoute = "vault" | "generator" | "detected" | "settings";
const popupTabs = [
  { id: "vault", label: "Vault", icon: VaultIcon },
  { id: "generator", label: "Generator", icon: Key01Icon },
  { id: "detected", label: "Detected", icon: Search01Icon },
  { id: "settings", label: "Settings", icon: Settings01Icon },
] as const;
type PopupEntryView = "list" | "details" | "editor" | "delete";

export function PopupWorkspace({
  setup,
  workspace,
  browserLogins,
  settings,
  sync,
  initialRoute = "vault",
  onOpenOptions,
}: {
  sync?: PopupSyncCapabilities;
  initialRoute?: PopupRoute;
  settings?: Pick<
    VaultSettingsCapabilities,
    "saveDevice" | "inspectAuthorization"
  >;
  setup: SetupCapabilities;
  workspace: WorkspaceCapabilities;
  browserLogins?: BrowserLoginCapabilities;
  onOpenOptions: (route?: OptionsRoute) => Promise<void>;
}) {
  const live = useVaultSetup(setup);
  const retry = live.retry;
  const handleSessionLost = useCallback(() => {
    void retry();
  }, [retry]);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(false);
  const [route, setRoute] = useState<PopupRoute>(initialRoute);
  const [entryState, setEntryState] = useState<{
    view: PopupEntryView;
    pending: boolean;
  }>({ view: "list", pending: false });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const entryControls = useRef<WorkspaceControls>(null);
  function navigate(next: PopupRoute) {
    if (entryState.view === "details") {
      setEntryWorkspaceRevision((revision) => revision + 1);
      setEntryState({ view: "list", pending: false });
    }
    setRoute(next);
    content.current?.scrollTo?.({ top: 0 });
    content.current?.focus();
  }
  const [generatorPending, setGeneratorPending] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft>();
  const [entryWorkspaceRevision, setEntryWorkspaceRevision] = useState(0);
  async function open(optionsRoute?: OptionsRoute) {
    if (opening) return;
    setOpening(true);
    setOpenError(false);
    try {
      await onOpenOptions(optionsRoute);
    } catch {
      setOpenError(true);
    } finally {
      setOpening(false);
    }
  }
  const createEntry = useCallback(
    (initial?: { password?: string; login?: string }) => {
      setEntryDraft({
        ...emptyEntryDraft,
        ...initial,
        tagIds: [],
      });
      setEntryWorkspaceRevision((revision) => revision + 1);
      setRoute("vault");
      setEntryState({ view: "editor", pending: false });
    },
    [],
  );
  const onEntryStateChange = useCallback(
    (state: { view: PopupEntryView; pending: boolean }) => {
      setEntryState(state);
    },
    [],
  );
  const consumeEntryDraft = useCallback(() => {
    setEntryDraft(undefined);
  }, []);
  if (live.loading || (!live.vault && !live.vaults.length))
    return (
      <PopupView
        availability={
          live.loading ? "loading" : live.inspectionFailed ? "error" : "empty"
        }
        onOpenOptions={onOpenOptions}
        onRetry={() => void live.retry()}
      />
    );
  const readyVault =
    live.vault?.unlocked && live.vault.complete ? live.vault : undefined;
  const ready = !!readyVault;
  const localNavigationDisabled =
    generatorPending ||
    settingsBusy ||
    entryState.pending ||
    entryState.view === "editor" ||
    entryState.view === "delete";
  return (
    <main className="flex h-[var(--extension-popup-height)] max-h-[100svh] w-[var(--extension-popup-width)] max-w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3">
        <h1 className="text-xl font-semibold tracking-tight">
          {ready ? popupTabs.find((tab) => tab.id === route)?.label : "Vault"}
        </h1>
        <div className="flex items-center gap-1">
          {ready &&
          route === "vault" &&
          entryState.view === "list" &&
          !entryState.pending ? (
            <Button
              className="h-9 gap-1.5 px-3 text-sm"
              disabled={opening}
              onClick={() => createEntry()}
            >
              <HugeiconsIcon icon={Add01Icon} size={17} aria-hidden="true" />
              New
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-label="Open Options"
            title="Open Options"
            onClick={() => void open()}
            disabled={opening || localNavigationDisabled}
          >
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              size={17}
              aria-hidden="true"
            />
            Options
          </Button>
          {ready ? (
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Lock vault"
              title="Lock vault"
              onClick={() => {
                setEntryDraft(undefined);
                setEntryState({ view: "list", pending: false });
                if (entryControls.current) void entryControls.current.lock();
                else void live.lock();
              }}
            >
              <HugeiconsIcon
                icon={LockKeyholeIcon}
                size={18}
                aria-hidden="true"
              />
            </Button>
          ) : null}
        </div>
      </header>
      <div
        ref={content}
        tabIndex={-1}
        data-focus-target
        className="min-h-0 flex-1 overflow-y-auto p-3 outline-none"
      >
        {openError ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            Could not open Options. Try again.
          </p>
        ) : null}
        {readyVault ? (
          <>
            {live.error ? (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {live.error}
              </p>
            ) : null}
            {sync ? (
              <div hidden={route !== "vault" || entryState.view !== "list"}>
                <PopupSync
                  key={readyVault.vaultId}
                  vaultId={readyVault.vaultId}
                  capabilities={sync}
                  disabled={localNavigationDisabled}
                  onOpenOptions={() => void open("sync")}
                />
              </div>
            ) : null}
            {route === "generator" ? (
              <PasswordToolsPage
                tools={workspace.tools}
                presentation="popup"
                onUse={createEntry}
                onPendingChange={setGeneratorPending}
                onSessionLost={handleSessionLost}
              />
            ) : route === "settings" ? (
              <PopupSettings
                key={readyVault.vaultId}
                vault={readyVault}
                capabilities={settings}
                onBusyChange={setSettingsBusy}
                onSaved={() => void live.retry(false)}
                onSessionLost={handleSessionLost}
                onOpenOptions={() => void open("settings")}
              />
            ) : (
              <PopupEntries
                section={route === "detected" ? "detected" : "vault"}
                browserLogins={browserLogins}
                key={`${readyVault.vaultId}:${route}:${live.draftRevision}:${entryWorkspaceRevision}`}
                vaultId={readyVault.vaultId}
                capabilities={workspace}
                onSessionLost={live.retry}
                onLock={live.lock}
                controlsRef={entryControls}
                initialDraft={entryDraft}
                onDraftConsumed={consumeEntryDraft}
                onStateChange={onEntryStateChange}
                onOpenSync={() => void open("sync")}
              />
            )}
          </>
        ) : live.vault?.unlocked ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Finish vault setup</h2>
            <Button onClick={() => void open()} disabled={opening}>
              Continue in Options
            </Button>
          </div>
        ) : (
          <PopupVaultAccess
            key={`${live.vault?.vaultId ?? "none"}:${live.draftRevision}`}
            vaults={live.vaults}
            selectedVault={live.vault}
            pending={live.pending}
            error={live.error}
            onSelectVault={(vaultId) => void live.selectVault(vaultId)}
            onUnlock={(password) => void live.unlock(password)}
            onOpenRecovery={() => void open("recover-access")}
          />
        )}
      </div>
      {ready ? (
        <nav
          aria-label="Popup navigation"
          className="grid h-14 shrink-0 auto-cols-fr grid-flow-col border-t bg-background px-2"
        >
          {popupTabs
            .filter((tab) => tab.id !== "detected" || browserLogins)
            .map((tab) => (
              <Button
                key={tab.id}
                variant={route === tab.id ? "secondary" : "ghost"}
                className="h-full min-w-0 flex-col gap-0.5 rounded-none px-1 text-xs"
                aria-current={route === tab.id ? "page" : undefined}
                onClick={() => navigate(tab.id)}
                disabled={localNavigationDisabled}
              >
                <HugeiconsIcon icon={tab.icon} size={18} aria-hidden="true" />
                {tab.label}
              </Button>
            ))}
        </nav>
      ) : null}
    </main>
  );
}
