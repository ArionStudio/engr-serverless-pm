import { useId, useRef } from "react";
import type { VisiblePasswordEntryFields } from "@lfspm/core";
import { Button } from "@/ui/components/primitives/button";
import { Badge } from "@/ui/components/primitives/badge";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "@/ui/components/primitives/input-group";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
} from "@/ui/components/primitives/item";
import {
  Field,
  FieldLabel,
  FieldError,
} from "@/ui/components/primitives/field";
import {
  Combobox,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxValue,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
  useComboboxAnchor,
} from "@/ui/components/primitives/combobox";
import { EmptyState } from "@/ui/components/layout/sections.view";
import { Spinner } from "@/ui/components/primitives/spinner";
import { Skeleton } from "@/ui/components/primitives/skeleton";
export function SearchField({
  value,
  onChange,
  onSubmit,
  searching = false,
  summary,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  searching?: boolean;
  summary: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field>
      <FieldLabel htmlFor={id}>Search entries</FieldLabel>
      <InputGroup>
        <InputGroupInput
          ref={input}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Search logins, websites or tags…"
        />
        <InputGroupAddon
          align="inline-end"
          className="data-[align=inline-end]:mr-0"
        >
          {searching ? <Spinner /> : null}
          <InputGroupButton
            aria-label="Clear search"
            disabled={!value}
            onClick={() => {
              onChange("");
              input.current?.focus();
            }}
          >
            Clear
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p role="status" className="text-xs text-muted-foreground">
        {summary}
      </p>
    </Field>
  );
}
export function EntryRow({
  entry,
  selected,
  onOpen,
  onSelect,
  tagLabels = {},
}: {
  entry: VisiblePasswordEntryFields;
  tagLabels?: Readonly<Record<number, string>>;
  selected?: boolean;
  onOpen: (id: string) => void;
  onSelect?: (id: string) => void;
}) {
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>
          <Button
            variant="link"
            className="h-auto min-w-0 justify-start px-0 text-left whitespace-normal break-all"
            onClick={() => onOpen(entry.id)}
          >
            {entry.login || "Unnamed login"}
          </Button>
        </ItemTitle>
        <ItemDescription className="break-all">
          {entry.sanitizedUrl}
        </ItemDescription>
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tagLabels[tag] ?? "Unknown tag"}
            </Badge>
          ))}
        </div>
      </ItemContent>
      {onSelect ? (
        <ItemActions>
          <Button
            variant={selected ? "secondary" : "outline"}
            aria-pressed={selected}
            onClick={() => onSelect(entry.id)}
          >
            {selected ? "Selected" : "Select"}
          </Button>
        </ItemActions>
      ) : null}
    </Item>
  );
}
export function EntryList({
  entries,
  selectedId,
  onOpen,
  onSelect,
  state = "ready",
  onRetry,
  tagLabels,
}: {
  entries: readonly VisiblePasswordEntryFields[];
  tagLabels?: Readonly<Record<number, string>>;
  selectedId?: string;
  onOpen: (id: string) => void;
  onSelect?: (id: string) => void;
  state?: "ready" | "loading" | "error";
  onRetry?: () => void;
}) {
  if (state === "loading")
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading entries</span>
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-20" />
        ))}
      </div>
    );
  if (state === "error")
    return (
      <EmptyState
        title="Entries are unavailable"
        description="Try loading this vault again."
        action="Try again"
        onAction={onRetry}
      />
    );
  if (!entries.length)
    return (
      <EmptyState
        title="No matching entries"
        description="Try a different search or clear your filters."
      />
    );
  return (
    <ItemGroup className="gap-3">
      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          tagLabels={tagLabels}
          selected={entry.id === selectedId}
          onOpen={onOpen}
          onSelect={onSelect}
        />
      ))}
    </ItemGroup>
  );
}
export function EntrySelection(props: Parameters<typeof EntryList>[0]) {
  return (
    <section aria-label="Choose an entry">
      <EntryList {...props} />
    </section>
  );
}
export type TagOption = { id: number; label: string };
export function TagSelection({
  options,
  value,
  onChange,
  error,
  disabled = false,
  loading = false,
}: {
  options: readonly TagOption[];
  value: readonly number[];
  onChange: (ids: number[]) => void;
  error?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const id = useId();
  const anchor = useComboboxAnchor();
  return (
    <Field>
      <div className="flex items-center gap-2">
        <FieldLabel htmlFor={id}>Tags</FieldLabel>
        {loading ? <Spinner aria-label="Loading tags" /> : null}
      </div>
      <Combobox
        multiple
        items={options}
        value={options.filter((o) => value.includes(o.id))}
        itemToStringLabel={(o) => o.label}
        onValueChange={(values) => onChange(values.map((v) => v.id))}
        disabled={disabled || loading}
      >
        <ComboboxChips ref={anchor}>
          <ComboboxValue>
            {(values: TagOption[]) => (
              <>
                {values.map((v) => (
                  <ComboboxChip key={v.id} removeLabel={`Remove ${v.label}`}>
                    {v.label}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput
                  id={id}
                  placeholder="Add tags…"
                  aria-invalid={!!error}
                  aria-describedby={error ? `${id}-error` : undefined}
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No matching tags.</ComboboxEmpty>
          <ComboboxList>
            {(v: TagOption) => (
              <ComboboxItem key={v.id} value={v}>
                {v.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}
