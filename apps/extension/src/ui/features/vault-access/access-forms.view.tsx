import { useState } from "react";
import type { FormPresentation } from "@/ui/components/forms/form-state.type";
import { FormFrame, FormPassword } from "@/ui/components/forms/form-frame.view";
import { Button } from "@/ui/components/primitives/button";
import {
  LockDurationField,
  PasswordStrengthFeedback,
} from "@/ui/components/forms/fields.view";
import { SafetyHelp } from "@/ui/components/layout/sections.view";
import { VaultPicker, type VaultOption } from "./vault-picker.view";
import { GeneratedVaultPasswordAction } from "../vault-setup/generated-vault-password-action.view";
import type { GenerateVaultPassword } from "../vault-setup/setup.type";
export type UnlockDraft = {
  vaultId: string | null;
  password: string;
  lockDuration: number;
};
export function UnlockForm({
  value,
  onChange,
  errors,
  vaults,
  lockOptions,
  ...form
}: FormPresentation<UnlockDraft> & {
  vaults: readonly VaultOption[];
  lockOptions: readonly { value: number; label: string }[];
}) {
  return (
    <FormFrame {...form} label="Unlock vault">
      <VaultPicker
        vaults={vaults}
        value={value.vaultId}
        onChange={(vaultId) => onChange({ ...value, vaultId })}
        error={errors?.vaultId}
      />
      <FormPassword
        label="Password for this browser"
        value={value.password}
        onChange={(password) => onChange({ ...value, password })}
        error={errors?.password}
        autoComplete="current-password"
      />
      <LockDurationField
        value={value.lockDuration}
        onChange={(lockDuration) => onChange({ ...value, lockDuration })}
        options={lockOptions}
        description="This setting applies only in this browser."
        error={errors?.lockDuration}
      />
    </FormFrame>
  );
}
export type PasswordChangeDraft = {
  currentPassword: string;
  password: string;
  confirmation: string;
};
export function PasswordChangeForm({
  value,
  onChange,
  errors,
  score,
  strengthState = "ready",
  onRetryStrength,
  generatePassword,
  ...form
}: FormPresentation<PasswordChangeDraft> & {
  score?: 0 | 1 | 2 | 3 | 4;
  strengthState?: "ready" | "pending" | "unavailable";
  onRetryStrength?: () => void;
  generatePassword: GenerateVaultPassword;
}) {
  const [generationPending, setGenerationPending] = useState(false);
  const pending = form.state === "pending" || generationPending;
  return (
    <FormFrame
      {...form}
      label="Change password"
      canSubmit={strengthState === "ready" && !generationPending}
    >
      <SafetyHelp
        title="Password for this browser"
        essential="This changes how you unlock this local vault. Other browsers keep their own passwords."
      />
      <FormPassword
        label="Current password"
        value={value.currentPassword}
        onChange={(currentPassword) => onChange({ ...value, currentPassword })}
        error={errors?.currentPassword}
        autoComplete="current-password"
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
        label="Confirm new password"
        value={value.confirmation}
        onChange={(confirmation) => onChange({ ...value, confirmation })}
        error={errors?.confirmation}
        disabled={pending}
      />
    </FormFrame>
  );
}
