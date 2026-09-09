import { useState } from "react";
import type { FormPresentation } from "@/ui/components/forms/form-state.type";
import { FormFrame, FormPassword } from "@/ui/components/forms/form-frame.view";
import { PasswordStrengthFeedback } from "@/ui/components/forms/fields.view";
import { Button } from "@/ui/components/primitives/button";
import { GeneratedVaultPasswordAction } from "./generated-vault-password-action.view";
import type { GenerateVaultPassword } from "./setup.type";
export type PasswordCreationDraft = { password: string; confirmation: string };
export function PasswordCreationForm({
  value,
  onChange,
  errors,
  score,
  strengthState = "ready",
  onConfirmationBlur,
  onRetryStrength,
  generatePassword,
  submitLabel = "Continue to device settings",
  ...form
}: FormPresentation<PasswordCreationDraft> & {
  score?: 0 | 1 | 2 | 3 | 4;
  strengthState?: "ready" | "pending" | "unavailable";
  onConfirmationBlur?: () => void;
  onRetryStrength?: () => void;
  generatePassword: GenerateVaultPassword;
  submitLabel?: string;
}) {
  const [generationPending, setGenerationPending] = useState(false);
  const canSubmit = strengthState === "ready";
  const pending = form.state === "pending" || generationPending;
  return (
    <FormFrame
      {...form}
      canSubmit={canSubmit}
      actions={
        <div className="flex justify-between gap-3 border-t pt-5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={form.onCancel}
          >
            Back
          </Button>
          <Button type="submit" size="lg" disabled={pending || !canSubmit}>
            {submitLabel}
          </Button>
        </div>
      }
    >
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
          onChange({ password, confirmation: password })
        }
      />
      {value.password ? (
        <div>
          <PasswordStrengthFeedback score={score} state={strengthState} />
          {strengthState === "unavailable" && onRetryStrength ? (
            <Button type="button" variant="outline" onClick={onRetryStrength}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
      <FormPassword
        label="Confirm password"
        value={value.confirmation}
        onChange={(confirmation) => onChange({ ...value, confirmation })}
        onBlur={onConfirmationBlur}
        error={errors?.confirmation}
        disabled={pending}
      />
      <p role="status" className="min-h-5 text-sm">
        {value.password && value.password === value.confirmation
          ? "Passwords match."
          : null}
      </p>
    </FormFrame>
  );
}
