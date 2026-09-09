import { useState } from "react";
import { ArrowRight01Icon, LockKeyholeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PasswordField } from "@/ui/components/forms/fields.view";
import { Button } from "@/ui/components/primitives/button";
import { Spinner } from "@/ui/components/primitives/spinner";
import { VaultPicker } from "@/ui/features/vault-access";
import type { SetupVault } from "@/ui/features/vault-setup/setup.type";

export function PopupVaultAccess({
  vaults,
  selectedVault,
  pending,
  error,
  onSelectVault,
  onUnlock,
  onOpenRecovery,
}: {
  vaults: readonly Pick<SetupVault, "vaultId" | "name">[];
  selectedVault?: SetupVault | null;
  pending: boolean;
  error?: string;
  onSelectVault: (vaultId: string) => void;
  onUnlock: (password: string) => void;
  onOpenRecovery: () => void;
}) {
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const selectedVaultId = selectedVault?.vaultId ?? null;

  return (
    <section className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center-safe px-4 py-8">
      <div className="mb-7 flex flex-col items-center gap-4 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-primary/12 text-primary">
          <HugeiconsIcon
            icon={LockKeyholeIcon}
            size={25}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </span>
        <h2 className="text-2xl font-semibold tracking-tight">
          {selectedVault ? "Unlock vault" : "Choose a vault"}
        </h2>
        {selectedVault && vaults.length === 1 ? (
          <p className="text-sm font-medium text-muted-foreground">
            {selectedVault.name}
          </p>
        ) : null}
      </div>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (selectedVault && password && !pending) onUnlock(password);
        }}
      >
        {vaults.length > 1 || !selectedVault ? (
          <VaultPicker
            vaults={vaults.map((vault) => ({
              id: vault.vaultId,
              name: vault.name,
              deviceLabel: "This browser",
            }))}
            value={selectedVaultId}
            disabled={pending}
            onChange={(vaultId) => {
              if (!vaultId || pending) return;
              setPassword("");
              setRevealed(false);
              onSelectVault(vaultId);
            }}
          />
        ) : null}

        {selectedVault ? (
          <>
            <PasswordField
              label="Vault password"
              value={password}
              onChange={setPassword}
              revealed={revealed}
              onRevealChange={setRevealed}
              error={error}
              autoComplete="current-password"
              disabled={pending}
            />
            <Button
              type="submit"
              size="lg"
              className="h-11 w-full justify-between px-4 text-sm"
              disabled={pending || !password}
            >
              <span className="flex items-center gap-2">
                {pending ? <Spinner aria-hidden="true" /> : null}
                {pending ? "Unlocking…" : "Unlock vault"}
              </span>
              {!pending ? (
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={17}
                  aria-hidden="true"
                />
              ) : null}
            </Button>
            <Button
              type="button"
              variant="link"
              className="h-9 w-full text-sm"
              disabled={pending}
              onClick={() => {
                setPassword("");
                setRevealed(false);
                onOpenRecovery();
              }}
            >
              Forgot password?
            </Button>
          </>
        ) : null}
      </form>
    </section>
  );
}
