import type { FormPresentation } from "@/ui/components/forms/form-state.type";
import { FormFrame, FormPassword } from "@/ui/components/forms/form-frame.view";
import type { ReactNode } from "react";
import { SafetyHelp } from "@/ui/components/layout/sections.view";
import { RecoveryWordInput } from "./recovery.view";
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
  ...form
}: FormPresentation<LocalRecoveryDraft> & {
  vaultSelector: ReactNode;
  localDataAvailable: boolean;
}) {
  return (
    <FormFrame
      {...form}
      canSubmit={localDataAvailable}
      onSubmit={() => {
        if (localDataAvailable) form.onSubmit();
      }}
      label="Recover local access"
    >
      <SafetyHelp
        title="Recovery needs local vault data"
        essential={
          localDataAvailable
            ? "Your words restore access to the selected local vault. After recovery you will save a replacement recovery record."
            : "Recovery words alone cannot recreate missing vault data. Restore the required local data before continuing."
        }
      />
      {vaultSelector}
      <fieldset disabled={!localDataAvailable} className="min-w-0 space-y-5">
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
        />
        <FormPassword
          label="Confirm new password"
          value={value.confirmation}
          onChange={(confirmation) => onChange({ ...value, confirmation })}
          error={errors?.confirmation}
        />
      </fieldset>
    </FormFrame>
  );
}
