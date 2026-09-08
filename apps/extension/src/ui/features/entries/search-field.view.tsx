import { useId, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  Cancel01Icon,
  UserIcon,
  TagsIcon,
  Folder01Icon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
import { Field, FieldLabel } from "@/ui/components/primitives/field";
import { Button } from "@/ui/components/primitives/button";
import {
  InputGroupAddon,
  InputGroupButton,
} from "@/ui/components/primitives/input-group";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from "@/ui/components/primitives/combobox";
import { Spinner } from "@/ui/components/primitives/spinner";
import { parseEntrySearch, quoteEntrySearchValue } from "./entry-search";
import type { EntrySearchKind } from "./entry-search";

type FilterKind = Exclude<EntrySearchKind, "any">;
const filters = {
  login: { prefix: "@", label: "Login", icon: UserIcon },
  tag: { prefix: "#", label: "Tag", icon: TagsIcon },
  folder: { prefix: "/", label: "Folder", icon: Folder01Icon },
  website: { prefix: ":", label: "Website", icon: Globe02Icon },
} as const;
export function SearchField({
  value,
  onChange,
  onSubmit,
  searching = false,
  disabled = false,
  summary,
  presentation = "default",
  suggestions = {},
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  searching?: boolean;
  disabled?: boolean;
  summary?: string;
  presentation?: "default" | "popup";
  suggestions?: Partial<Record<FilterKind, readonly string[]>>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(value.length);
  const terms = parseEntrySearch(value);
  const last = terms.at(-1);
  const active =
    last &&
    last.kind !== "any" &&
    last.end === value.length &&
    cursor === value.length
      ? last
      : undefined;
  const kinds = Object.keys(filters) as FilterKind[];
  const offerKinds =
    cursor === value.length && (!last || last.end < value.length);
  const options =
    active && active.kind !== "any"
      ? [...new Set(suggestions[active.kind] ?? [])]
          .filter((candidate) =>
            candidate.toLowerCase().includes(active.value.toLowerCase()),
          )
          .slice(0, 6)
          .map((label) => ({
            kind: active.kind as FilterKind,
            label,
            next:
              value.slice(0, active.start) +
              filters[active.kind as FilterKind].prefix +
              quoteEntrySearchValue(label) +
              " ",
          }))
      : offerKinds
        ? kinds.map((kind) => ({
            kind,
            label: filters[kind].label,
            next: value + filters[kind].prefix,
          }))
        : [];
  function change(next: string) {
    onChange(next);
    setCursor(next.length);
  }
  return (
    <Field className="min-w-0 gap-2">
      <div
        className={
          presentation === "popup"
            ? "sr-only"
            : "flex items-baseline justify-between gap-3"
        }
      >
        <FieldLabel htmlFor={id}>Search entries</FieldLabel>
        {summary ? (
          <p role="status" className="text-xs text-muted-foreground">
            {summary}
          </p>
        ) : null}
      </div>
      <Combobox<(typeof options)[number]>
        items={options}
        disabled={disabled}
        value={null}
        inputValue={value}
        filter={null}
        modal={false}
        open={open && options.length > 0 && !disabled}
        onOpenChange={setOpen}
        itemToStringLabel={(option) => option.label}
        onInputValueChange={(next, details) => {
          if (details.reason === "input-change") {
            onChange(next);
            setCursor(input.current?.selectionStart ?? next.length);
            setOpen(true);
          }
        }}
        onValueChange={(option) => {
          if (!option) return;
          change(option.next);
          setOpen(false);
          input.current?.focus();
        }}
      >
        <div ref={anchor}>
          <ComboboxInput
            ref={input}
            id={id}
            disabled={disabled}
            showTrigger={false}
            className="h-10"
            placeholder="Search or use @ # / :"
            onFocus={(event) => {
              setCursor(event.currentTarget.selectionStart ?? value.length);
              setOpen(true);
            }}
            onSelect={(event) =>
              setCursor(event.currentTarget.selectionStart ?? value.length)
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.nativeEvent.isComposing &&
                !event.currentTarget.getAttribute("aria-activedescendant")
              ) {
                event.preventDefault();
                setOpen(false);
                onSubmit();
              }
            }}
          >
            <InputGroupAddon align="inline-start" className="pr-0">
              <HugeiconsIcon icon={Search01Icon} size={16} aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupAddon
              align="inline-end"
              className="data-[align=inline-end]:mr-0"
            >
              {searching ? <Spinner /> : null}
              {value ? (
                <InputGroupButton
                  disabled={disabled}
                  aria-label="Clear search"
                  onClick={() => {
                    change("");
                    input.current?.focus();
                    setOpen(false);
                  }}
                >
                  Clear
                </InputGroupButton>
              ) : null}
            </InputGroupAddon>
          </ComboboxInput>
        </div>
        <ComboboxContent anchor={anchor} className="min-w-0">
          <p className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">
            {active && active.kind !== "any"
              ? `${filters[active.kind].label} suggestions`
              : "Search by"}
          </p>
          <ComboboxList>
            {(option: (typeof options)[number]) => (
              <ComboboxItem
                key={option.next}
                value={option}
                className="min-h-10 gap-3 px-3 text-sm"
              >
                <HugeiconsIcon
                  icon={filters[option.kind].icon}
                  size={16}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <span className="font-mono text-muted-foreground">
                  {filters[option.kind].prefix}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {terms.some((term) => term.kind !== "any") ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Search filters">
          {terms
            .filter((term) => term.kind !== "any")
            .map((term) => {
              const filter = filters[term.kind as FilterKind];
              return (
                <span
                  key={term.start}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 py-1 pl-2 text-xs"
                >
                  <HugeiconsIcon
                    icon={filter.icon}
                    size={14}
                    aria-hidden="true"
                  />
                  <span className="shrink-0 text-muted-foreground">
                    {filter.label}
                  </span>
                  <span className="max-w-52 truncate font-medium">
                    {term.value || "…"}
                  </span>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Remove ${filter.label.toLowerCase()} filter${term.value ? ` ${term.value}` : ""}`}
                    onClick={() => {
                      change(
                        (
                          value.slice(0, term.start) + value.slice(term.end)
                        ).trim(),
                      );
                      input.current?.focus();
                    }}
                  >
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      size={12}
                      aria-hidden="true"
                    />
                  </Button>
                </span>
              );
            })}
        </div>
      ) : null}
    </Field>
  );
}
