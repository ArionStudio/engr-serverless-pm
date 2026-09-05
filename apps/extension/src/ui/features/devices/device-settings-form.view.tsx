import type { FormPresentation } from "@/ui/components/forms/form-state.type";
import { FormFrame } from "@/ui/components/forms/form-frame.view";
import {
  TextField,
  LockDurationField,
} from "@/ui/components/forms/fields.view";
import { SafetyHelp } from "@/ui/components/layout/sections.view";
export type DeviceSettingsDraft = { name: string; lockDuration: number };
export function DeviceSettingsForm({
  value,
  onChange,
  errors,
  lockOptions,
  ...form
}: FormPresentation<DeviceSettingsDraft> & {
  lockOptions: readonly { value: number; label: string }[];
}) {
  return (
    <FormFrame {...form}>
      <SafetyHelp
        title="Settings for this device"
        essential="The name and lock duration are stored locally. You can edit them later in settings."
      />
      <TextField
        label="Device name"
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        error={errors?.name}
        placeholder="This device"
      />
      <LockDurationField
        value={value.lockDuration}
        onChange={(lockDuration) => onChange({ ...value, lockDuration })}
        options={lockOptions}
        description="Time since unlocking, including while you are using the vault. Applies only to this device."
        error={errors?.lockDuration}
      />
    </FormFrame>
  );
}
