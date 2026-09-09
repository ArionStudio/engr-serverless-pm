import type { GeneratePasswordCommandParams } from "@lfspm/core";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/ui/components/primitives/button";
import { Slider } from "@/ui/components/primitives/slider";
import { Checkbox } from "@/ui/components/primitives/checkbox";
import { FieldLabel } from "@/ui/components/primitives/field";
import { TextField } from "@/ui/components/forms/fields.view";
import { Input } from "@/ui/components/primitives/input";
import { Spinner } from "@/ui/components/primitives/spinner";
export type PasswordSettings = Required<GeneratePasswordCommandParams>;

const PASSWORD_LENGTH_MIN = 1;
const PASSWORD_LENGTH_MAX = 128;

function clampInteger(value: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

const BoundedIntegerField = ({
  label,
  value,
  minimum,
  maximum,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) => {
  const [draft, setDraft] = useState(String(value));
  function commit() {
    const next = clampInteger(draft, minimum, maximum);
    setDraft(String(next));
    onChange(next);
  }
  return (
    <TextField
      type="number"
      min={minimum}
      max={maximum}
      label={label}
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
    />
  );
};

function passwordSettingsError(value: PasswordSettings) {
  if (
    !Number.isInteger(value.length) ||
    value.length < PASSWORD_LENGTH_MIN ||
    value.length > PASSWORD_LENGTH_MAX
  )
    return "Password length must be a whole number from 1 to 128.";
  if (
    !Number.isInteger(value.minNumbers) ||
    value.minNumbers < 0 ||
    value.minNumbers > value.length
  )
    return "Minimum numbers must be a whole number from 0 to the password length.";
  if (
    !Number.isInteger(value.minSpecial) ||
    value.minSpecial < 0 ||
    value.minSpecial > value.length
  )
    return "Minimum special characters must be a whole number from 0 to the password length.";
  if (!value.uppercase && !value.lowercase && !value.numbers && !value.special)
    return "Select at least one character group.";
  if (!value.numbers && value.minNumbers > 0)
    return "Select Numbers or set Minimum numbers to 0.";
  if (!value.special && value.minSpecial > 0)
    return "Select Special characters or set Minimum special characters to 0.";
  if (value.minNumbers + value.minSpecial > value.length)
    return "Minimum numbers and special characters cannot exceed the password length.";
  return undefined;
}

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
  const validationError = error ?? passwordSettingsError(value);
  return (
    <fieldset disabled={pending} className="space-y-5">
      <BoundedIntegerField
        key={value.length}
        label="Password length"
        value={value.length}
        minimum={PASSWORD_LENGTH_MIN}
        maximum={PASSWORD_LENGTH_MAX}
        onChange={(length) => onChange({ ...value, length })}
      />
      <Slider
        aria-label="Password length slider"
        min={PASSWORD_LENGTH_MIN}
        max={PASSWORD_LENGTH_MAX}
        value={[value.length]}
        disabled={pending}
        onValueChange={(v) => {
          const next = Array.isArray(v) ? v[0] : v;
          onChange({
            ...value,
            length: Math.min(
              PASSWORD_LENGTH_MAX,
              Math.max(PASSWORD_LENGTH_MIN, Math.round(next)),
            ),
          });
        }}
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
      <BoundedIntegerField
        key={`numbers-${value.minNumbers}-${value.length}`}
        disabled={!value.numbers}
        label="Minimum numbers"
        value={value.minNumbers}
        minimum={0}
        maximum={value.length}
        onChange={(minNumbers) => onChange({ ...value, minNumbers })}
      />
      <BoundedIntegerField
        key={`special-${value.minSpecial}-${value.length}`}
        disabled={!value.special}
        label="Minimum special characters"
        value={value.minSpecial}
        minimum={0}
        maximum={value.length}
        onChange={(minSpecial) => onChange({ ...value, minSpecial })}
      />
      {validationError ? (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      ) : null}
      <Button disabled={pending || !!validationError} onClick={onGenerate}>
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
  onCopyError,
  label = "Generated value",
  conceal = true,
  useLabel = "Use this value",
  children,
}: {
  value?: string;
  revealed: boolean;
  onRevealChange: (value: boolean) => void;
  onUse: () => void;
  onCopy?: () => Promise<void> | void;
  onCopyError?: (cause: unknown) => void;
  label?: string;
  conceal?: boolean;
  useLabel?: string;
  children?: ReactNode;
}) {
  const [copyState, setCopyState] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  async function copy() {
    if (!value || !onCopy || copyState === "pending") return;
    setCopyState("pending");
    try {
      await onCopy();
      setCopyState("success");
    } catch (cause) {
      onCopyError?.(cause);
      setCopyState("error");
    }
  }

  return (
    <div className="space-y-3">
      {value ? (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">{label}</p>
            <div className="flex flex-wrap gap-2">
              {conceal && !revealed ? (
                <span
                  aria-label={label}
                  className="flex h-10 min-w-48 flex-1 items-center rounded-md border border-input bg-input-surface/20 px-3 font-mono text-sm text-muted-foreground"
                >
                  Concealed
                </span>
              ) : (
                <Input
                  aria-label={label}
                  readOnly
                  value={value}
                  type="text"
                  className="min-w-48 flex-1 font-mono"
                />
              )}
              {conceal ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onRevealChange(!revealed)}
                >
                  {revealed ? "Hide" : "Show"}
                </Button>
              ) : null}
              {onCopy ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={copyState === "pending"}
                  onClick={() => void copy()}
                >
                  {copyState === "pending" ? <Spinner /> : null}
                  {copyState === "success"
                    ? "Copied"
                    : copyState === "pending"
                      ? "Copying…"
                      : "Copy"}
                </Button>
              ) : null}
            </div>
          </div>
          {copyState === "success" ? (
            <p role="status" className="text-sm text-muted-foreground">
              Copied. The clipboard will clear after 30 seconds.
            </p>
          ) : copyState === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              Could not copy this value. Try again.
            </p>
          ) : null}
          {children}
          <Button onClick={onUse}>{useLabel}</Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Generate a value to review it here.
        </p>
      )}
    </div>
  );
}
