import { useId, useState, type ComponentProps } from "react";
import { Button } from "@/ui/components/primitives/button";
import { Input } from "@/ui/components/primitives/input";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/ui/components/primitives/field";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "@/ui/components/primitives/input-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
import { Spinner } from "@/ui/components/primitives/spinner";

export function TextField({
  label,
  description,
  error,
  ...props
}: ComponentProps<typeof Input> & {
  label: string;
  description?: string;
  error?: string;
}) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${id}-error` : description ? `${id}-help` : undefined
        }
      />
      {description ? (
        <FieldDescription id={`${id}-help`}>{description}</FieldDescription>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}
export function PasswordField({
  label,
  value,
  onChange,
  revealed,
  onRevealChange,
  error,
  description,
  disabled = false,
  autoComplete = "new-password",
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  revealed: boolean;
  onRevealChange: (revealed: boolean) => void;
  error?: string;
  description?: string;
  disabled?: boolean;
  autoComplete?: string;
  onBlur?: () => void;
}) {
  const id = useId();
  const [capsLock, setCapsLock] = useState(false);
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))}
          onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
          onBlur={() => {
            setCapsLock(false);
            onBlur?.();
          }}
          autoComplete={autoComplete}
          spellCheck={false}
          autoCapitalize="none"
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={
            [
              description && `${id}-help`,
              error && `${id}-error`,
              capsLock && `${id}-caps`,
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        <InputGroupAddon
          align="inline-end"
          className="data-[align=inline-end]:mr-0"
        >
          <InputGroupButton
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-pressed={revealed}
            aria-label={`${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`}
            onClick={() => onRevealChange(!revealed)}
          >
            {revealed ? "Hide" : "Show"}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {description ? (
        <FieldDescription id={`${id}-help`}>{description}</FieldDescription>
      ) : null}
      {capsLock ? (
        <p id={`${id}-caps`} role="status" className="text-sm">
          Caps Lock is on.
        </p>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}
export function PasswordStrengthFeedback({
  score,
  state = "ready",
}: {
  score?: 0 | 1 | 2 | 3 | 4;
  state?: "ready" | "pending" | "unavailable";
}) {
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;
  if (state === "ready" && score === undefined) return null;
  const ready = state === "ready" && score !== undefined;
  return (
    <div className="min-h-16 space-y-2 text-sm" role="status">
      <meter
        className={`h-2 w-full accent-primary ${ready ? "" : "invisible"}`}
        min={0}
        max={4}
        value={score ?? 0}
        aria-label="Password strength"
        aria-valuetext={score === undefined ? undefined : labels[score]}
        aria-hidden={!ready}
      />
      <p className="min-h-6">
        {state === "pending"
          ? "Checking password strength…"
          : state === "unavailable"
            ? "Couldn’t check password strength. Try again."
            : score === undefined
              ? null
              : labels[score]}
      </p>
    </div>
  );
}
export function LockDurationField({
  value,
  onChange,
  options,
  description,
  error,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  options: readonly { value: number; label: string }[];
  description: string;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>Lock duration on this device</FieldLabel>
      <NativeSelect
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-help ${id}-error` : `${id}-help`}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldDescription id={`${id}-help`}>{description}</FieldDescription>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}
export function FormActions({
  pending,
  onCancel,
  label = "Save",
  disabled = false,
}: {
  pending: boolean;
  onCancel: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3 border-t pt-5">
      <Button type="submit" size="lg" disabled={pending || disabled}>
        {pending ? <Spinner /> : null}
        {pending ? "Working…" : label}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}
