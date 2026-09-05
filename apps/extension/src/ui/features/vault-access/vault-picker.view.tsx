import { useId } from "react";
import {
  Field,
  FieldLabel,
  FieldError,
} from "@/ui/components/primitives/field";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/ui/components/primitives/combobox";
import { Button } from "@/ui/components/primitives/button";
import { Spinner } from "@/ui/components/primitives/spinner";
export type VaultOption = { id: string; name: string; deviceLabel: string };
export function VaultPicker({
  vaults,
  value,
  onChange,
  loading = false,
  error,
  onCreate,
}: {
  vaults: readonly VaultOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  loading?: boolean;
  error?: string;
  onCreate?: () => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>Vault</FieldLabel>
      {loading ? (
        <p role="status" className="flex gap-2 text-sm">
          <Spinner />
          Loading vaults…
        </p>
      ) : (
        <Combobox
          items={vaults}
          value={vaults.find((v) => v.id === value) ?? null}
          onValueChange={(v) => onChange(v?.id ?? null)}
          itemToStringLabel={(v) => `${v.name} · ${v.deviceLabel}`}
        >
          <ComboboxInput
            id={id}
            placeholder="Find a vault…"
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <ComboboxContent>
            <ComboboxEmpty>No matching vaults.</ComboboxEmpty>
            <ComboboxList>
              {(v: VaultOption) => (
                <ComboboxItem key={v.id} value={v}>
                  <span>
                    {v.name}
                    <span className="ml-2 text-muted-foreground">
                      {v.deviceLabel}
                    </span>
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      {onCreate ? (
        <Button variant="outline" onClick={onCreate}>
          Create another vault
        </Button>
      ) : null}
    </Field>
  );
}
