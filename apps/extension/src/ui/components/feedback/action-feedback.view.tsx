import { Button } from "@/ui/components/primitives/button";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/ui/components/primitives/alert";
import { Spinner } from "@/ui/components/primitives/spinner";
import type { OperationState } from "../forms/form-state.type";

export function ActionFeedback({
  state,
  message,
  onRetry,
}: {
  state: OperationState;
  message?: string;
  onRetry?: () => void;
}) {
  if (state === "idle" || !message) return null;
  return (
    <Alert
      variant={state === "error" ? "destructive" : "default"}
      role={state === "error" ? "alert" : "status"}
    >
      <AlertTitle>
        {state === "pending"
          ? "In progress"
          : state === "success"
            ? "Completed"
            : "Action needs attention"}
      </AlertTitle>
      <AlertDescription>
        {message}
        {state === "error" && onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
export function CopyAction({
  state = "idle",
  onCopy,
  description,
  label = "Copy",
}: {
  state?: OperationState;
  onCopy: () => void;
  description?: string;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={state === "pending"}
        onClick={onCopy}
      >
        {state === "pending" ? <Spinner /> : null}
        {state === "success"
          ? "Copied"
          : state === "pending"
            ? "Copying…"
            : label}
      </Button>
      {state === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          Could not copy. Try again.
        </p>
      ) : null}
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
export function SecretField({
  label,
  state,
  value,
  onReveal,
  onHide,
  onCopy,
}: {
  label: string;
  state: "concealed" | "pending" | "revealed" | "error" | "disabled";
  value?: string;
  onReveal: () => void;
  onHide: () => void;
  onCopy?: () => void;
}) {
  const unavailable = state === "pending" || state === "disabled";
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label={label}>
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 break-all font-mono text-sm">
          {state === "revealed"
            ? value
            : state === "pending"
              ? "Retrieving…"
              : "Concealed"}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={unavailable}
          onClick={state === "revealed" ? onHide : onReveal}
        >
          {state === "revealed" ? "Hide" : "Reveal"}
        </Button>
        {onCopy ? (
          <Button
            type="button"
            variant="outline"
            disabled={unavailable}
            onClick={onCopy}
          >
            Copy without revealing
          </Button>
        ) : null}
      </div>
      {state === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          This value could not be retrieved.
        </p>
      ) : null}
    </section>
  );
}
