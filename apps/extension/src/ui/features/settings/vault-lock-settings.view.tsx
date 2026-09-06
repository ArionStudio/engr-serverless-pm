import { useState } from "react";
import { LockDurationField } from "@/ui/components/forms/fields.view";
import { Button } from "@/ui/components/primitives/button";
import { vaultLockOptions } from "@/ui/lib/vault-lock-options";

export function VaultLockSettings({
  duration,
  pending,
  error,
  onSave,
}: {
  duration: number;
  pending: boolean;
  error?: string;
  onSave: (duration: number) => void;
}) {
  const [value, setValue] = useState(duration);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && value !== duration) onSave(value);
      }}
    >
      <h2 className="text-lg font-semibold">Automatic locking</h2>
      <fieldset disabled={pending} className="space-y-4">
        <LockDurationField
          value={value}
          onChange={setValue}
          options={vaultLockOptions}
          description="Time since unlocking, including while using the vault. Changes apply to this vault on this browser from the next unlock."
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="outline"
          disabled={pending || value === duration}
        >
          {pending ? "Saving…" : "Save lock setting"}
        </Button>
      </fieldset>
    </form>
  );
}
