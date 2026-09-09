import { useEffect, useRef, useState } from "react";
import { Key01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/ui/components/primitives/button";
import { Spinner } from "@/ui/components/primitives/spinner";
import type { GenerateVaultPassword } from "./setup.type";

type PasswordDraft = { password: string; confirmation: string };
type GenerationState = "idle" | "pending" | "stale" | "error";

export function GeneratedVaultPasswordAction({
  generatePassword,
  value,
  disabled = false,
  onPendingChange,
  onGenerated,
}: {
  generatePassword: GenerateVaultPassword;
  value: PasswordDraft;
  disabled?: boolean;
  onPendingChange: (pending: boolean) => void;
  onGenerated: (password: string) => void;
}) {
  const [state, setState] = useState<GenerationState>("idle");
  const epoch = useRef(0);
  const latestDraft = useRef(value);
  useEffect(() => {
    latestDraft.current = value;
  }, [value]);
  useEffect(() => {
    return () => {
      epoch.current += 1;
    };
  }, []);
  async function generate() {
    if (disabled || state === "pending") return;
    const request = ++epoch.current;
    const startedDraft = latestDraft.current;
    setState("pending");
    onPendingChange(true);
    try {
      const result = await generatePassword();
      if (request !== epoch.current) return;
      const currentDraft = latestDraft.current;
      if (
        currentDraft.password !== startedDraft.password ||
        currentDraft.confirmation !== startedDraft.confirmation
      ) {
        setState("stale");
        return;
      }
      onGenerated(result.password);
      setState("idle");
    } catch {
      if (request === epoch.current) setState("error");
    } finally {
      if (request === epoch.current) onPendingChange(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={disabled || state === "pending"}
        onClick={() => void generate()}
      >
        {state === "pending" ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={Key01Icon} aria-hidden="true" />
        )}
        {state === "pending"
          ? "Generating…"
          : value.password
            ? "Replace with generated password"
            : "Generate strong password"}
      </Button>
      <p className="max-w-prose text-sm leading-6 text-muted-foreground">
        Save this browser password somewhere you can access while the vault is
        locked. It is not stored inside the vault.
      </p>
      {state === "stale" || state === "error" ? (
        <p
          role={state === "error" ? "alert" : "status"}
          className={
            state === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {state === "stale"
            ? "The password changed while generation was running. Your current password was kept."
            : "Could not generate a strong password. Your current password was kept. Try again."}
        </p>
      ) : null}
    </div>
  );
}
