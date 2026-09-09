import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppNavigation } from "../components/app-navigation.view";
import { Button } from "@/ui/components/primitives/button";
import { EntryWorkspace } from "@/ui/features/entries/entry-workspace.view";
import type { EntryDraft } from "@/ui/features/entries/entry-form.view";
import { emptyEntryDraft } from "@/ui/features/entries/entry-draft";
import type {
  WorkspaceCapabilities,
  WorkspaceControls,
} from "@/ui/features/entries/workspace.type";
import { PasswordToolsPage } from "@/ui/features/password-tools/password-tools-page.view";
import { SyncPage } from "@/ui/features/sync/sync-page.view";
import type { SyncCapabilities } from "@/ui/features/sync/sync.type";
import { DeviceManagementView } from "@/ui/features/devices/device-management.view";
import type { DeviceCapabilities } from "@/ui/features/devices/device-management.type";
import { VaultSettingsView } from "@/ui/features/settings/vault-settings.view";
import type { VaultSettingsCapabilities } from "@/ui/features/settings/settings.type";
import type {
  AssessPassword,
  GenerateVaultPassword,
  SetupVault,
} from "@/ui/features/vault-setup/setup.type";
import type { VaultDestination } from "./options-route";
import type { TagManagementCapabilities } from "@/ui/features/tags";
import type { FolderManagementCapabilities } from "@/ui/features/folders";
import { OrganizationManagementView } from "@/ui/features/organization";

const destinations: readonly {
  id: VaultDestination;
  label: string;
  available: boolean;
}[] = [
  { id: "entries", label: "Entries", available: true },
  { id: "tags", label: "Tags", available: true },
  { id: "tools", label: "Password tools", available: true },
  { id: "devices", label: "Devices", available: true },
  { id: "sync", label: "Sync", available: true },
  { id: "settings", label: "Settings", available: true },
];

export function VaultApplication({
  vault,
  workspace,
  tagManagement,
  folderManagement,
  sync,
  devices,
  settings,
  assessPassword,
  generatePassword,
  appearance,
  onLock,
  onReplaceRecovery,
  onRefresh,
  onSessionLost,
  onDeleted,
  initialDestination = "entries",
  initialEntryDraft,
}: {
  vault: SetupVault;
  workspace: WorkspaceCapabilities;
  tagManagement: TagManagementCapabilities;
  folderManagement: FolderManagementCapabilities;
  sync: SyncCapabilities;
  devices: DeviceCapabilities;
  settings: VaultSettingsCapabilities;
  assessPassword: AssessPassword;
  generatePassword: GenerateVaultPassword;
  appearance: ReactNode;
  onLock: () => void | Promise<void>;
  onReplaceRecovery: () => void;
  onRefresh: (clearDraft?: boolean) => void;
  onSessionLost: () => void;
  onDeleted: () => void;
  initialDestination?: VaultDestination;
  initialEntryDraft?: EntryDraft;
}) {
  const [destination, setDestination] = useState(initialDestination);
  const [draft, setDraft] = useState<EntryDraft | undefined>(initialEntryDraft);
  const [entryVisit, setEntryVisit] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const entryControls = useRef<WorkspaceControls>(null);
  const firstFocus = useRef(true);
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    (document.scrollingElement ?? document.documentElement).scrollTop = 0;
    content.current?.focus({ preventScroll: true });
  }, [destination, entryVisit]);
  function navigate(next: string) {
    const destination = destinations.find((item) => item.id === next)?.id;
    if (!destination) return;
    setDraft(undefined);
    setDestination(destination);
  }
  return (
    <div className="space-y-8">
      <div className="space-y-4 border-b pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 break-all font-medium">{vault.name}</p>
          <Button
            variant="outline"
            onClick={() => {
              if (entryControls.current) void entryControls.current.lock();
              else void onLock();
            }}
          >
            Lock vault
          </Button>
        </div>
        <AppNavigation
          items={destinations}
          current={destination}
          onNavigate={navigate}
        />
      </div>
      <div
        ref={content}
        tabIndex={-1}
        data-focus-target
        className="min-w-0 outline-none"
      >
        {destination === "entries" ? (
          <EntryWorkspace
            key={entryVisit}
            vaultId={vault.vaultId}
            capabilities={workspace}
            onSessionLost={onSessionLost}
            onLock={onLock}
            controlsRef={entryControls}
            initialDraft={draft}
            onDraftConsumed={() => setDraft(undefined)}
            onSync={() => navigate("sync")}
          />
        ) : destination === "tools" ? (
          <PasswordToolsPage
            tools={workspace.tools}
            onSessionLost={onSessionLost}
            onUse={(value) => {
              setDraft({ ...emptyEntryDraft, ...value, tagIds: [] });
              setEntryVisit((visit) => visit + 1);
              setDestination("entries");
            }}
          />
        ) : destination === "tags" ? (
          <OrganizationManagementView
            vaultId={vault.vaultId}
            tagCapabilities={tagManagement}
            folderCapabilities={folderManagement}
            onSessionLost={onSessionLost}
          />
        ) : destination === "devices" ? (
          <DeviceManagementView
            vaultId={vault.vaultId}
            capabilities={devices}
            onOpenSync={() => navigate("sync")}
            onSessionLost={onSessionLost}
          />
        ) : destination === "sync" ? (
          <SyncPage
            onSessionLost={onSessionLost}
            vaultId={vault.vaultId}
            capabilities={sync}
            onBack={() => navigate("entries")}
          />
        ) : (
          <div className="max-w-3xl space-y-8">
            <VaultSettingsView
              vault={vault}
              capabilities={settings}
              onSessionLost={onSessionLost}
              assessPassword={assessPassword}
              generatePassword={generatePassword}
              onReplaceRecovery={onReplaceRecovery}
              onDeleted={onDeleted}
              onSaved={() => onRefresh(false)}
            />
            <section className="space-y-4 rounded-lg border bg-card p-5 @lg:p-6">
              <h2 className="text-lg font-semibold">Appearance</h2>
              {appearance}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
