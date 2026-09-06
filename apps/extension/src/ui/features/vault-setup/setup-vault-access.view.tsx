import { useState } from "react";
import { PasswordField } from "@/ui/components/forms/fields.view";
import { Button } from "@/ui/components/primitives/button";
import { SafetyHelp } from "@/ui/components/layout/sections.view";
import type { SetupVault } from "./setup.type";

export function SetupVaultAccess({
  vault,
  pending,
  error,
  onUnlock,
  onReplace,
  onLock,
}: {
  vault: SetupVault;
  pending: boolean;
  error?: string;
  onUnlock: (password: string) => void;
  onReplace: () => void;
  onLock: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState("");
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {!vault.unlocked
          ? "Unlock vault"
          : vault.complete
            ? "Vault ready"
            : "Finish saving recovery words"}
      </h1>
      <p className="font-medium">{vault.name}</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!vault.unlocked ? (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending && password) {
              onUnlock(password);
              setPassword("");
            }
          }}
        >
          <PasswordField
            label="Vault password"
            value={password}
            onChange={setPassword}
            revealed={revealed}
            onRevealChange={setRevealed}
            autoComplete="current-password"
            disabled={pending}
          />
          <Button type="submit" disabled={pending || !password}>
            {pending ? "Unlocking…" : "Unlock"}
          </Button>
        </form>
      ) : (
        <>
          {!vault.complete ? (
            <>
              <SafetyHelp
                title="Replace the words from interrupted setup"
                essential="Your vault was created, but recovery verification was not completed. Generate a replacement set and save all 24 words. The previous words will no longer match this browser’s current recovery data. Retained older backups can still work with their original words."
              />
              <Button disabled={pending} onClick={onReplace}>
                {pending ? "Generating…" : "Generate replacement words"}
              </Button>
            </>
          ) : (
            <p role="status">
              Recovery words verified. Your vault is saved in this browser.
            </p>
          )}
          <Button variant="outline" disabled={pending} onClick={onLock}>
            Lock vault
          </Button>
        </>
      )}
    </section>
  );
}
