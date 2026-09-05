import { vaultLockOptions } from "@/ui/lib/vault-lock-options";
import { Button } from "@/ui/components/primitives/button";
import {
  TextField,
  LockDurationField,
} from "@/ui/components/forms/fields.view";

export function SetupDevice({
  name,
  onNameChange,
  duration,
  onDurationChange,
  onBack,
  onFinish,
}: {
  name: string;
  onNameChange: (name: string) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Device settings</h1>
      <TextField
        label="Device name"
        placeholder="Home laptop"
        value={name}
        maxLength={80}
        onChange={(event) => onNameChange(event.target.value)}
      />
      <LockDurationField
        value={duration}
        onChange={onDurationChange}
        options={vaultLockOptions}
        description="Time since unlocking, including while you are using the vault."
      />
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={onBack}>
          Back to password
        </Button>
        <Button onClick={onFinish}>Cancel setup</Button>
      </div>
    </div>
  );
}
