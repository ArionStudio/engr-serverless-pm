import { useState } from "react";
import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";
import type { SetupCapabilities } from "@/ui/features/vault-setup/setup.type";
import { useVaultSetup } from "@/ui/features/vault-setup/use-vault-setup";
import { SetupVaultAccess } from "@/ui/features/vault-setup/setup-vault-access.view";
import { VaultPicker } from "@/ui/features/vault-access";
import { Button } from "@/ui/components/primitives/button";
import { PopupView } from "./popup.view";
import { PopupEntries } from "./popup-entries.view";

export function PopupWorkspace({
  setup,
  workspace,
  onOpenOptions,
}: {
  setup: SetupCapabilities;
  workspace: WorkspaceCapabilities;
  onOpenOptions: () => Promise<void>;
}) {
  const live = useVaultSetup(setup);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(false);
  async function open() {
    if (opening) return;
    setOpening(true);
    setOpenError(false);
    try {
      await onOpenOptions();
    } catch {
      setOpenError(true);
    } finally {
      setOpening(false);
    }
  }
  if (!live.vault && !live.vaults.length)
    return (
      <PopupView
        availability={
          live.loading ? "loading" : live.inspectionFailed ? "error" : "empty"
        }
        onOpenOptions={onOpenOptions}
        onRetry={() => void live.retry()}
      />
    );
  return (
    <main className="max-h-[580px] w-[400px] max-w-full overflow-y-auto bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <span className="text-sm font-semibold">LFSPM</span>
        <Button variant="ghost" onClick={() => void open()} disabled={opening}>
          {opening ? "Opening…" : "Open Options"}
        </Button>
      </header>
      <div className="space-y-5 p-5">
        {openError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not open Options. Try again.
          </p>
        ) : null}
        {!live.vault?.unlocked ? (
          <VaultPicker
            vaults={live.vaults.map((vault) => ({
              id: vault.vaultId,
              name: vault.name,
              deviceLabel: "This browser",
            }))}
            value={live.vault?.vaultId ?? null}
            loading={live.pending}
            onChange={(id) => {
              void live.selectVault(id);
            }}
          />
        ) : null}
        {live.vault?.unlocked && live.vault.complete ? (
          <>
            {live.error ? (
              <p role="alert" className="text-sm text-destructive">
                {live.error}
              </p>
            ) : null}
            <PopupEntries
              key={live.vault.vaultId}
              vaultId={live.vault.vaultId}
              capabilities={workspace}
              onSessionLost={live.retry}
              onLock={live.lock}
            />
          </>
        ) : live.vault?.unlocked ? (
          <>
            <h1 className="text-xl font-semibold">Finish vault setup</h1>
            <Button onClick={() => void open()} disabled={opening}>
              Continue in Options
            </Button>
          </>
        ) : live.vault ? (
          <SetupVaultAccess
            key={live.vault.vaultId}
            vault={live.vault}
            pending={live.pending}
            error={live.error}
            onUnlock={(password) => {
              void live.unlock(password);
            }}
            onReplace={() => {
              void open();
            }}
            onLock={() => {
              void live.lock();
            }}
          />
        ) : (
          <h1 className="text-xl font-semibold">Choose a vault</h1>
        )}
      </div>
    </main>
  );
}
