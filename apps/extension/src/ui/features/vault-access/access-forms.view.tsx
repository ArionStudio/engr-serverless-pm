import type { FormPresentation } from "@/ui/components/forms/form-state.type";
import { FormFrame, FormPassword } from "@/ui/components/forms/form-frame.view";
import { Button } from "@/ui/components/primitives/button";
import {
  LockDurationField,
  PasswordStrengthFeedback,
} from "@/ui/components/forms/fields.view";
import { SafetyHelp } from "@/ui/components/layout/sections.view";
import { VaultPicker, type VaultOption } from "./vault-picker.view";
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
        label="Master password"
        value={value.password}
        onChange={(password) => onChange({ ...value, password })}
        error={errors?.password}
        autoComplete="current-password"
      />
      <LockDurationField
        value={value.lockDuration}
        onChange={(lockDuration) => onChange({ ...value, lockDuration })}
        options={lockOptions}
        description="This setting applies only on this device."
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
  ...form
}: FormPresentation<PasswordChangeDraft> & {
  score?: 0 | 1 | 2 | 3 | 4;
  strengthState?: "ready" | "pending" | "unavailable";
  onRetryStrength?: () => void;
}) {
  return (
    <FormFrame
      {...form}
      label="Change password"
      canSubmit={strengthState === "ready"}
    >
      <SafetyHelp
        title="Password on this device"
        essential="This changes how you unlock this local vault. Other devices keep their own passwords."
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
      />
    </FormFrame>
  );
}
