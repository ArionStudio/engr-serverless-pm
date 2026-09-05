import { useId } from "react";
import { Badge } from "@/ui/components/primitives/badge";
import { Button } from "@/ui/components/primitives/button";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/ui/components/primitives/radio-group";
import { Field, FieldLabel } from "@/ui/components/primitives/field";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/ui/components/primitives/alert";
export type SyncDisplayState =
  | "unconfigured"
  | "checking"
  | "uploading"
  | "complete"
  | "pending"
  | "review-required"
  | "failed";
export function SyncStatus({
  state,
  detail,
  onAction,
  action,
}: {
  state: SyncDisplayState;
  detail: string;
  onAction?: () => void;
  action?: string;
}) {
  return (
    <div className="space-y-3">
      <Badge variant={state === "failed" ? "destructive" : "outline"}>
        {state.replaceAll("-", " ")}
      </Badge>
      <p role="status" className="text-sm text-muted-foreground">
        {detail}
      </p>
      {onAction && action ? (
        <Button variant="outline" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </div>
  );
}
export type Resolution = "use_local" | "use_remote";
export type Comparison = {
  id: string;
  label: string;
  local: string;
  remote: string;
  passwordChanged: boolean;
  allowed: readonly Resolution[];
};
export function ComparisonRow({ item }: { item: Comparison }) {
  return (
    <div className="@container space-y-3">
      <h4 className="font-medium">{item.label}</h4>
      <dl className="grid gap-3 @lg:grid-cols-2">
        <div className="rounded-md bg-muted/30 p-3">
          <dt className="text-xs font-semibold">Local</dt>
          <dd className="mt-2 break-all text-sm">{item.local}</dd>
        </div>
        <div className="rounded-md bg-muted/30 p-3">
          <dt className="text-xs font-semibold">Remote</dt>
          <dd className="mt-2 break-all text-sm">{item.remote}</dd>
        </div>
      </dl>
      {item.passwordChanged ? (
        <p className="text-xs text-muted-foreground">
          Password differs. Values remain concealed.
        </p>
      ) : null}
    </div>
  );
}
export function ResolutionSelector({
  allowed,
  value,
  onChange,
}: {
  allowed: readonly Resolution[];
  value?: Resolution;
  onChange: (value: Resolution) => void;
}) {
  const id = useId();
  return (
    <RadioGroup
      value={value ?? ""}
      onValueChange={(v) => {
        if (v === "use_local" || v === "use_remote") onChange(v);
      }}
      aria-label="Choose which version to keep"
      className="flex flex-wrap gap-4"
    >
      {(["use_local", "use_remote"] as const).map((choice) => (
        <Field key={choice} orientation="horizontal">
          <FieldLabel id={`${id}-${choice}`}>
            <RadioGroupItem
              value={choice}
              aria-labelledby={`${id}-${choice}`}
              disabled={!allowed.includes(choice)}
            />
            {choice === "use_local" ? "Keep local" : "Use remote"}
          </FieldLabel>
        </Field>
      ))}
    </RadioGroup>
  );
}
export function ReviewSummary({
  selected,
  total,
}: {
  selected: number;
  total: number;
}) {
  return (
    <p role="status" className="text-sm">
      {selected} of {total} decisions made. Review each choice before applying.
    </p>
  );
}
export function SyncReview({
  items,
  choices,
  onChange,
  onApply,
  state = "reviewing",
}: {
  items: readonly Comparison[];
  choices: Readonly<Record<string, Resolution>>;
  onChange: (id: string, value: Resolution) => void;
  onApply: () => void;
  state?: "loading" | "reviewing" | "applying" | "stale" | "error";
}) {
  const selected = items.filter(
    (i) => choices[i.id] && i.allowed.includes(choices[i.id]),
  ).length;
  return (
    <section className="space-y-5" aria-label="Sync review">
      {state === "stale" || state === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>
            {state === "stale"
              ? "This review is out of date"
              : "Changes could not be applied"}
          </AlertTitle>
          <AlertDescription>
            Refresh the review before choosing again. No automatic merge is
            performed.
          </AlertDescription>
        </Alert>
      ) : null}
      {state === "loading" ? (
        <p role="status">Loading comparison…</p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="space-y-4 rounded-lg border p-4">
            <ComparisonRow item={item} />
            <ResolutionSelector
              allowed={state === "reviewing" ? item.allowed : []}
              value={choices[item.id]}
              onChange={(value) => onChange(item.id, value)}
            />
          </div>
        ))
      )}
      <ReviewSummary selected={selected} total={items.length} />
      <Button
        disabled={
          state !== "reviewing" ||
          selected !== items.length ||
          items.length === 0
        }
        onClick={onApply}
      >
        {state === "applying" ? "Applying…" : "Apply reviewed choices"}
      </Button>
    </section>
  );
}
