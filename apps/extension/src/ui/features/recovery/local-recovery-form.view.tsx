import type { FormPresentation } from "@/ui/components/forms/form-state.type";
import { FormFrame, FormPassword } from "@/ui/components/forms/form-frame.view";
import { PasswordStrengthFeedback } from "@/ui/components/forms/fields.view";
import { Button } from "@/ui/components/primitives/button";
import { Spinner } from "@/ui/components/primitives/spinner";
import { useState, type ReactNode } from "react";
import { SafetyHelp } from "@/ui/components/layout/sections.view";
import { RecoveryWordInput } from "./recovery.view";
import { GeneratedVaultPasswordAction } from "../vault-setup/generated-vault-password-action.view";
import type { GenerateVaultPassword } from "../vault-setup/setup.type";
export type LocalRecoveryDraft = {
  phrase: string;
  password: string;
  confirmation: string;
};
// The options-page composition supplies the vault selector through this slot.
export function LocalRecoveryForm({
  value,
  onChange,
  errors,
  vaultSelector,
  localDataAvailable,
  score,
  strengthState = "ready",
  onRetryStrength,
  generatePassword,
  ...form
}: FormPresentation<LocalRecoveryDraft> & {
  vaultSelector: ReactNode;
  localDataAvailable: boolean;
  score?: 0 | 1 | 2 | 3 | 4;
  strengthState?: "ready" | "pending" | "unavailable";
  onRetryStrength?: () => void;
  generatePassword: GenerateVaultPassword;
}) {
  const [generationPending, setGenerationPending] = useState(false);
  const mutationPending = form.state === "pending";
  const pending = form.state === "pending" || generationPending;
  const canSubmit = localDataAvailable && strengthState === "ready";
  return (
    <FormFrame
      {...form}
      noValidate
      canSubmit={canSubmit}
      onSubmit={() => {
        if (localDataAvailable) form.onSubmit();
      }}
      label="Set new password"
      actions={
        <div className="flex flex-wrap gap-3 border-t pt-5">
          <Button type="submit" disabled={pending || !canSubmit}>
            {mutationPending ? <Spinner /> : null}
            {mutationPending ? "Setting new password…" : "Set new password"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={form.onCancel}
          >
            Cancel
          </Button>
        </div>
      }
    >
      <SafetyHelp
        title="Recovery needs local vault data"
        essential={
          localDataAvailable
            ? "Use the 24 words saved for this browser. Recovery sets a new password and replaces its recovery words. Save the new words before leaving. Do not uninstall the extension or clear its browser data."
            : "Recovery words alone cannot recreate missing vault data. Restore the required local data before continuing."
        }
      />
      {vaultSelector}
      <fieldset
        disabled={!localDataAvailable || pending}
        className="min-w-0 space-y-5"
      >
        <RecoveryWordInput
          value={value.phrase}
          onChange={(phrase) => onChange({ ...value, phrase })}
          error={errors?.phrase}
        />
        <FormPassword
          label="New password"
          value={value.password}
          onChange={(password) => onChange({ ...value, password })}
          error={errors?.password}
          disabled={pending}
        />
        <GeneratedVaultPasswordAction
          generatePassword={generatePassword}
          value={value}
          disabled={pending}
          onPendingChange={setGenerationPending}
          onGenerated={(password) =>
            onChange({ ...value, password, confirmation: password })
          }
        />
        {value.password ? (
          <PasswordStrengthFeedback score={score} state={strengthState} />
        ) : null}
        {value.password &&
        strengthState === "unavailable" &&
        onRetryStrength ? (
          <Button type="button" variant="outline" onClick={onRetryStrength}>
            Try again
          </Button>
        ) : null}
        <FormPassword
          label="Confirm new password"
          value={value.confirmation}
          onChange={(confirmation) => onChange({ ...value, confirmation })}
          error={errors?.confirmation}
          disabled={pending}
        />
      </fieldset>
    </FormFrame>
  );
}
