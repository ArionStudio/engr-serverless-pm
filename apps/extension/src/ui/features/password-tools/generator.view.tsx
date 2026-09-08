import type { GeneratePasswordCommandParams } from "@lfspm/core";
import { useId } from "react";
import { Button } from "@/ui/components/primitives/button";
import { Slider } from "@/ui/components/primitives/slider";
import { Checkbox } from "@/ui/components/primitives/checkbox";
import { FieldLabel } from "@/ui/components/primitives/field";
import { TextField } from "@/ui/components/forms/fields.view";
import { SecretField } from "@/ui/components/feedback/action-feedback.view";
export type PasswordSettings = Required<GeneratePasswordCommandParams>;
export function GeneratorControls({
  value,
  onChange,
  onGenerate,
  pending = false,
  error,
}: {
  value: PasswordSettings;
  onChange: (value: PasswordSettings) => void;
  onGenerate: () => void;
  pending?: boolean;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset disabled={pending} className="space-y-5">
      <TextField
        type="number"
        min={1}
        max={128}
        label="Password length"
        value={value.length}
        onChange={(e) => onChange({ ...value, length: Number(e.target.value) })}
      />
      <Slider
        aria-label="Password length slider"
        min={1}
        max={128}
        value={[value.length]}
        disabled={pending}
        onValueChange={(v) =>
          onChange({ ...value, length: Array.isArray(v) ? v[0] : v })
        }
      />
      <div className="grid gap-3">
        {(
          [
            "uppercase",
            "lowercase",
            "numbers",
            "special",
            "avoidAmbiguousCharacters",
          ] as const
        ).map((key) => (
          <FieldLabel key={key} id={`${id}-${key}`}>
            <Checkbox
              aria-labelledby={`${id}-${key}`}
              checked={value[key]}
              disabled={pending}
              onCheckedChange={(checked) =>
                onChange({
                  ...value,
                  [key]: checked,
                  ...(!checked && key === "numbers" ? { minNumbers: 0 } : {}),
                  ...(!checked && key === "special" ? { minSpecial: 0 } : {}),
                })
              }
            />
            {
              {
                uppercase: "Uppercase letters",
                lowercase: "Lowercase letters",
                numbers: "Numbers",
                special: "Special characters",
                avoidAmbiguousCharacters: "Avoid ambiguous characters",
              }[key]
            }
          </FieldLabel>
        ))}
      </div>
      <TextField
        type="number"
        min={0}
        max={value.length}
        disabled={!value.numbers}
        label="Minimum numbers"
        value={value.minNumbers}
        onChange={(e) =>
          onChange({ ...value, minNumbers: Number(e.target.value) })
        }
      />
      <TextField
        type="number"
        min={0}
        max={value.length}
        disabled={!value.special}
        label="Minimum special characters"
        value={value.minSpecial}
        onChange={(e) =>
          onChange({ ...value, minSpecial: Number(e.target.value) })
        }
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button disabled={pending || !!error} onClick={onGenerate}>
        {pending ? "Generating…" : "Generate password"}
      </Button>
    </fieldset>
  );
}
export function UsernameControls({
  capitalize,
  includeNumber,
  onChange,
  onGenerate,
}: {
  capitalize: boolean;
  includeNumber: boolean;
  onChange: (value: { capitalize: boolean; includeNumber: boolean }) => void;
  onGenerate: () => void;
}) {
  const id = useId();
  return (
    <div className="space-y-4">
      {(["capitalize", "includeNumber"] as const).map((key) => (
        <FieldLabel key={key} id={`${id}-${key}`}>
          <Checkbox
            aria-labelledby={`${id}-${key}`}
            checked={key === "capitalize" ? capitalize : includeNumber}
            onCheckedChange={(checked) =>
              onChange({ capitalize, includeNumber, [key]: checked })
            }
          />
          {key === "capitalize" ? "Capitalize words" : "Include a number"}
        </FieldLabel>
      ))}
      <Button onClick={onGenerate}>Generate username</Button>
    </div>
  );
}
export function GeneratedValue({
  value,
  revealed,
  onRevealChange,
  onUse,
  onCopy,
}: {
  value?: string;
  revealed: boolean;
  onRevealChange: (value: boolean) => void;
  onUse: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-3">
      {value ? (
        <>
          <SecretField
            label="Generated value"
            state={revealed ? "revealed" : "concealed"}
            value={revealed ? value : undefined}
            onReveal={() => onRevealChange(true)}
            onHide={() => onRevealChange(false)}
            onCopy={onCopy}
          />
          <Button onClick={onUse}>Use this value</Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Generate a value to review it here.
        </p>
      )}
    </div>
  );
}
