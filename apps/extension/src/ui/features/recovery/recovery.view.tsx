import { useId } from "react";
import { parseRecoveryPhrase } from "./parse-recovery-phrase";
import { Button } from "@/ui/components/primitives/button";
import { Textarea } from "@/ui/components/primitives/textarea";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/ui/components/primitives/field";
import { TextField } from "@/ui/components/forms/fields.view";
import { Input } from "@/ui/components/primitives/input";
import { SafetyHelp } from "@/ui/components/layout/sections.view";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
} from "@/ui/components/primitives/item";
import { Spinner } from "@/ui/components/primitives/spinner";
export function RecoveryPhraseGrid({
  words,
  onReveal,
  onHide,
}: {
  words?: readonly string[];
  onReveal: () => void;
  onHide: () => void;
}) {
  return (
    <section className="@container space-y-4" aria-label="Recovery words">
      {words ? (
        <>
          <ol className="grid grid-cols-2 gap-2 @sm:grid-cols-3 @xl:grid-cols-4">
            {words.map((word, i) => (
              <li
                key={i}
                className="flex gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground tabular-nums">
                  {i + 1}.
                </span>
                <span className="min-w-0 break-all font-medium">{word}</span>
              </li>
            ))}
          </ol>
          <Button variant="outline" onClick={onHide}>
            Hide recovery words
          </Button>
        </>
      ) : (
        <div className="space-y-4 rounded-lg border border-dashed p-6">
          <p className="text-sm">
            Recovery words are concealed. Reveal them only when you can save
            them privately.
          </p>
          <Button onClick={onReveal}>Reveal recovery words</Button>
        </div>
      )}
    </section>
  );
}
export type ExportMethod = {
  id: string;
  label: string;
  description: string;
  actionLabel?: string;
  state?: "idle" | "pending" | "requested" | "error";
};
export function RecoveryExportChoices({
  methods,
  onRequest,
}: {
  methods: readonly ExportMethod[];
  onRequest: (id: string) => void;
}) {
  return (
    <ItemGroup className="gap-2">
      {methods.map((m) => (
        <Item key={m.id} variant="outline">
          <ItemContent>
            <ItemTitle>{m.label}</ItemTitle>
            <ItemDescription>{m.description}</ItemDescription>
            {m.state === "requested" ? (
              <p role="status" className="text-xs">
                Requested. Check that your copy was saved.
              </p>
            ) : m.state === "error" ? (
              <p role="alert" className="text-xs text-destructive">
                Could not complete this request. Another method is available.
              </p>
            ) : null}
          </ItemContent>
          <ItemActions>
            <Button
              variant="outline"
              aria-label={
                m.actionLabel ? `${m.actionLabel}: ${m.label}` : m.label
              }
              disabled={m.state === "pending"}
              onClick={() => onRequest(m.id)}
            >
              {m.state === "pending" ? <Spinner /> : null}
              {m.state === "pending"
                ? "Preparing…"
                : (m.actionLabel ?? "Choose")}
            </Button>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
export function RecoveryGuide({
  words,
  identity,
}: {
  words: readonly string[];
  identity: string;
}) {
  return (
    <article className="recovery-print-guide space-y-5 rounded-lg border bg-background p-6">
      <h3 className="text-xl font-semibold">Recovery record</h3>
      <p className="text-sm">{identity}</p>
      <ol className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {words.map((word, i) => (
          <li key={i} className="break-all">
            {i + 1}. {word}
          </li>
        ))}
      </ol>
      <p className="text-sm leading-relaxed">
        Keep your recovery record somewhere private, outside this vault.
        Recovery also depends on the local data required by this application.
        Never send your words to support or enter them on another website.
      </p>
    </article>
  );
}
type RecoveryWordInputProps = {
  error?: string;
  disabled?: boolean;
} & (
  | {
      positional: true;
      value: readonly string[];
      onChange: (words: readonly string[]) => void;
    }
  | { positional?: false; value: string; onChange: (phrase: string) => void }
);
export function RecoveryWordInput({
  value,
  onChange,
  error,
  disabled = false,
  positional,
}: RecoveryWordInputProps) {
  const id = useId();
  const slotCount = positional ? Math.max(24, value.length) : 0;
  return (
    <Field>
      <FieldLabel htmlFor={positional ? `${id}-1` : id}>
        Recovery phrase
      </FieldLabel>
      {positional ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: slotCount }, (_, i) => (
            <Field key={i} data-invalid={!!error}>
              <FieldLabel htmlFor={`${id}-${i + 1}`}>Word {i + 1}</FieldLabel>
              <Input
                id={`${id}-${i + 1}`}
                value={value[i] ?? ""}
                aria-invalid={!!error}
                aria-describedby={
                  error ? `${id}-help ${id}-error` : `${id}-help`
                }
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                onChange={(e) => {
                  const next = Array.from(
                    { length: slotCount },
                    (_, n) => value[n] ?? "",
                  );
                  next[i] = e.target.value;
                  onChange(next);
                }}
              />
            </Field>
          ))}
        </div>
      ) : (
        <Textarea
          id={id}
          rows={4}
          value={value}
          onPaste={(event) => {
            const field = event.currentTarget;
            const next =
              value.slice(0, field.selectionStart) +
              event.clipboardData.getData("text/plain") +
              value.slice(field.selectionEnd);
            const words = parseRecoveryPhrase(next);
            if (words) {
              event.preventDefault();
              onChange(words.join(" "));
            }
          }}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-help ${id}-error` : `${id}-help`}
        />
      )}
      <FieldDescription id={`${id}-help`}>
        {positional
          ? "Enter one word in each field. Keep the original order."
          : "Paste all 24 words, with or without numbers. Keep the original order."}
      </FieldDescription>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}
export function RecoveryVerification({
  positions,
  answers,
  onChange,
  errors = {},
  pending = false,
  complete = false,
  onSubmit,
  onReview,
}: {
  positions: readonly number[];
  answers: Readonly<Record<number, string>>;
  onChange: (position: number, value: string) => void;
  errors?: Readonly<Record<number, string>>;
  pending?: boolean;
  complete?: boolean;
  onSubmit: () => void;
  onReview: () => void;
}) {
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending && !complete) onSubmit();
      }}
    >
      <SafetyHelp
        title="Check your saved copy"
        essential="Find these three positions in the copy you saved. This spot-check does not verify every word."
      />
      <div className="grid gap-4">
        {positions.map((position) => (
          <TextField
            key={position}
            label={`Word ${position}`}
            value={answers[position] ?? ""}
            onChange={(e) => onChange(position, e.target.value)}
            error={errors[position]}
            disabled={pending || complete}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
          />
        ))}
      </div>
      {complete ? (
        <p role="status" className="text-sm">
          The three selected positions are confirmed.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || complete}>
          {pending ? "Checking…" : "Check words"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onReview}
        >
          Review recovery words
        </Button>
      </div>
    </form>
  );
}
