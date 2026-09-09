import { useState } from "react";
import { PasswordField } from "@/ui/components/forms/fields.view";
import { Button } from "@/ui/components/primitives/button";
import { SafetyHelp } from "@/ui/components/layout/sections.view";
import { RecoverVaultAccess } from "./recover-vault-access.view";
import type {
  AssessPassword,
  GenerateVaultPassword,
  SetupVault,
} from "./setup.type";
import { useOperationErrorFocus } from "./use-operation-error-focus";

export function SetupVaultAccess({
  vault,
  pending,
  error,
  onUnlock,
  onReplace,
  onLock,
  onRecover,
  onDismissError,
  assessPassword,
  generatePassword,
  onOpenRecovery,
  initiallyRecovering = false,
  onExitRecovery,
}: {
  vault: SetupVault;
  pending: boolean;
  error?: string;
  onUnlock: (password: string) => void;
  onReplace: () => void;
  onLock: () => void;
  initiallyRecovering?: boolean;
  onExitRecovery?: () => void;
} & (
  | {
      onRecover: (words: readonly string[], password: string) => void;
      onDismissError: () => void;
      assessPassword: AssessPassword;
      generatePassword: GenerateVaultPassword;
      onOpenRecovery?: never;
    }
  | {
      onOpenRecovery: () => void;
      onRecover?: never;
      onDismissError?: never;
      assessPassword?: never;
      generatePassword?: never;
    }
)) {
  const [recovering, setRecovering] = useState(initiallyRecovering);
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState("");
  const errorRef = useOperationErrorFocus(error);
  if (recovering && !vault.unlocked && onRecover && assessPassword)
    return (
      <RecoverVaultAccess
        vaultName={vault.name}
        pending={pending}
        error={error}
        assessPassword={assessPassword}
        generatePassword={generatePassword}
        onRecover={onRecover}
        onBack={() => {
          if (!pending) {
            setRecovering(false);
            onDismissError?.();
            onExitRecovery?.();
          }
        }}
      />
    );
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {vault.unlocked ? "Finish saving recovery words" : "Unlock vault"}
      </h1>
      <p className="font-medium">{vault.name}</p>
      {error ? (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          data-focus-target
          className="text-sm text-destructive outline-none"
        >
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
            label="Password for this browser"
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
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setPassword("");
              setRevealed(false);
              onDismissError?.();
              if (onOpenRecovery) onOpenRecovery();
              else setRecovering(true);
            }}
          >
            Forgot password?
          </Button>
        </form>
      ) : (
        <>
          <SafetyHelp
            title="Save replacement recovery words"
            essential="Recovery verification was not completed. Generate a replacement set and save all 24 words. The previous words will no longer match this browser’s current recovery data. Retained older backups can still work with their original words."
          />
          <Button disabled={pending} onClick={onReplace}>
            {pending ? "Generating…" : "Generate replacement words"}
          </Button>
          <Button variant="outline" disabled={pending} onClick={onLock}>
            Lock vault
          </Button>
        </>
      )}
    </section>
  );
}
