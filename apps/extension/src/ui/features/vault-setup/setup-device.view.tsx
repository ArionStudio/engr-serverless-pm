import { vaultLockOptions } from "@/ui/lib/vault-lock-options";
import { Button } from "@/ui/components/primitives/button";
import {
  TextField,
  LockDurationField,
} from "@/ui/components/forms/fields.view";
import { useOperationErrorFocus } from "./use-operation-error-focus";

export function SetupDevice({
  name,
  onNameChange,
  duration,
  onDurationChange,
  onBack,
  onFinish,
  pending = false,
  error,
}: {
  name: string;
  onNameChange: (name: string) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  onBack: () => void;
  onFinish: () => void;
  pending?: boolean;
  error?: string;
}) {
  const errorRef = useOperationErrorFocus(error);
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && name.trim()) onFinish();
      }}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Device settings</h1>
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
      <fieldset disabled={pending} className="space-y-6">
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
          description="Time since unlocking, including while you save recovery words or use the vault."
        />
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={onBack}>
            Back to password
          </Button>
          <Button type="submit" disabled={pending || !name.trim()}>
            Continue to organization
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
