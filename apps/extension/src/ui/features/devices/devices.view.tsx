import { useId } from "react";
import { Badge } from "@/ui/components/primitives/badge";
import { Button } from "@/ui/components/primitives/button";
import { Textarea } from "@/ui/components/primitives/textarea";
import { TextField } from "@/ui/components/forms/fields.view";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/ui/components/primitives/field";
export function DeviceSummary({
  name,
  identifier,
  state,
  onRevoke,
  pending = false,
  error,
}: {
  name: string;
  identifier: string;
  state: "current" | "other" | "revoked" | "unavailable";
  onRevoke?: () => void;
  pending?: boolean;
  error?: string;
}) {
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <Badge variant="outline">
        {state === "current" ? "This device" : state}
      </Badge>
      <h3 className="break-all font-semibold">{name}</h3>
      <p className="break-all text-xs text-muted-foreground">{identifier}</p>
      {onRevoke && state === "other" ? (
        <>
          <p className="text-sm">
            Revocation stops future trusted access. It cannot erase copies
            already on that device.
          </p>
          <Button variant="outline" disabled={pending} onClick={onRevoke}>
            {pending ? "Revoking…" : "Review revocation"}
          </Button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </article>
  );
}
export function TransferInput({
  value,
  onChange,
  onFile,
  state = "empty",
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onFile: (file: File) => void;
  state?: "empty" | "selected" | "validating" | "invalid" | "ready";
  error?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor={id}>Enrollment artifact</FieldLabel>
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={state === "validating"}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={state === "invalid"}
          aria-describedby={error ? `${id}-help ${id}-error` : `${id}-help`}
        />
        <FieldDescription id={`${id}-help`}>
          Paste artifact text or choose a file. Text is untrusted until it has
          been verified.
        </FieldDescription>
        {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      </Field>
      <TextField
        label="Choose artifact file"
        type="file"
        disabled={state === "validating"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <p role="status" className="text-sm">
        {state === "ready"
          ? "Verification passed."
          : state === "validating"
            ? "Verifying artifact…"
            : state === "selected"
              ? "Selected, awaiting verification."
              : ""}
      </p>
    </div>
  );
}
export function TransferOutput({
  description,
  metadata,
  onCopy,
  onExport,
  pending = false,
}: {
  description: string;
  metadata: string;
  onCopy: () => void;
  onExport: () => void;
  pending?: boolean;
}) {
  return (
    <article className="space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">Enrollment artifact</h3>
      <p className="text-sm">{description}</p>
      <p className="break-all text-xs text-muted-foreground">{metadata}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={onExport}>
          Download artifact
        </Button>
        <Button variant="outline" disabled={pending} onClick={onCopy}>
          Copy artifact
        </Button>
      </div>
    </article>
  );
}
