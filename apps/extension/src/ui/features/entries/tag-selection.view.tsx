import type {
  GlobalTagDefinition,
  TagColor,
  TagGroupId,
  TagShade,
} from "@lfspm/core";
import { PASSWORD_ENTRY_TAG_LIMIT } from "@lfspm/core";
import { useId, useMemo, useState } from "react";
import { Button } from "@/ui/components/primitives/button";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/primitives/dialog";
import { Input } from "@/ui/components/primitives/input";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/ui/components/primitives/field";
import { Spinner } from "@/ui/components/primitives/spinner";
import {
  getTagGroupPresentation,
  tagGroupPresentations,
  TagPill,
  TagVisualPicker,
  type TagGroupPresentation,
} from "@/ui/features/tags";

export type TagOption = {
  readonly id: string;
  readonly label: string;
  readonly group: TagGroupPresentation;
  readonly color: TagColor;
  readonly shade: TagShade;
  readonly aliases?: readonly string[];
};

type TagCreationDraft = {
  name: string;
  groupId: TagGroupId;
  color: TagColor;
  shade: TagShade;
};

function matches(option: TagOption, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return (
    !normalized ||
    option.label.toLocaleLowerCase().includes(normalized) ||
    option.aliases?.some((alias) =>
      alias.toLocaleLowerCase().includes(normalized),
    )
  );
}

export function TagSelection({
  options,
  groups = tagGroupPresentations,
  suggestions = [],
  value,
  onChange,
  onCreate,
  error,
  disabled = false,
  loading = false,
}: {
  options: readonly TagOption[];
  groups?: readonly TagGroupPresentation[];
  suggestions?: readonly GlobalTagDefinition[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  onCreate?: (tag: TagCreationDraft) => Promise<{ readonly id: string }>;
  error?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const id = useId();
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState("");
  const [created, setCreated] = useState<readonly TagOption[]>([]);
  const [creation, setCreation] = useState<TagCreationDraft>();
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState<string>();
  const limitReached = value.length >= PASSWORD_ENTRY_TAG_LIMIT;
  const available = useMemo(() => {
    const byId = new Map(options.map((option) => [option.id, option]));
    for (const option of created) byId.set(option.id, option);
    return [...byId.values()];
  }, [options, created]);
  const visible = available.filter((option) => matches(option, query));
  const normalized = query.trim().toLocaleLowerCase();
  const suggestion = suggestions.find(
    (candidate) =>
      !available.some(
        (option) =>
          option.label.trim().toLocaleLowerCase() ===
          candidate.name.trim().toLocaleLowerCase(),
      ) &&
      (candidate.name.toLocaleLowerCase().includes(normalized) ||
        candidate.aliases.some((alias) =>
          alias.toLocaleLowerCase().includes(normalized),
        )),
  );
  const exactMatch = available.some(
    (option) => option.label.trim().toLocaleLowerCase() === normalized,
  );
  function startCreation(candidate?: GlobalTagDefinition) {
    if (limitReached) return;
    const group = getTagGroupPresentation(
      candidate?.groupId ?? "other",
      groups,
    );
    setCreation({
      name: candidate?.name ?? query.trim(),
      groupId: group.id,
      color: candidate?.color ?? group.baseColor,
      shade: candidate?.shade ?? 500,
    });
    setCreationError(undefined);
  }
  async function create() {
    if (
      !creation ||
      !onCreate ||
      creating ||
      limitReached ||
      !creation.name.trim()
    )
      return;
    setCreating(true);
    setCreationError(undefined);
    try {
      const result = await onCreate({
        ...creation,
        name: creation.name.trim(),
      });
      const group = getTagGroupPresentation(creation.groupId, groups);
      const option: TagOption = {
        id: result.id,
        label: creation.name.trim(),
        group,
        color: creation.color,
        shade: creation.shade,
      };
      setCreated((current) => [...current, option]);
      onChange([...value, result.id]);
      setQuery("");
      setCreation(undefined);
    } catch {
      setCreationError(
        "Could not create this tag. Use a different name or try again.",
      );
    } finally {
      setCreating(false);
    }
  }
  return (
    <Field>
      <div className="flex items-center gap-2">
        <FieldLabel htmlFor={id}>Tags</FieldLabel>
        {loading ? <Spinner aria-label="Loading tags" /> : null}
      </div>
      <Combobox
        multiple
        items={available}
        value={available.filter((option) => value.includes(option.id))}
        itemToStringLabel={(option) => option.label}
        inputValue={query}
        onInputValueChange={(next) => setQuery(next)}
        onValueChange={(values) => {
          if (values.length <= PASSWORD_ENTRY_TAG_LIMIT)
            onChange(values.map(({ id }) => id));
        }}
        disabled={disabled || loading}
      >
        <ComboboxChips ref={anchor} className="min-h-10 gap-2 p-2">
          <ComboboxValue>
            {(values: TagOption[]) => (
              <>
                {values.map((option) => (
                  <ComboboxChip
                    key={option.id}
                    removeLabel={`Remove ${option.label}`}
                    className="h-auto bg-transparent p-0"
                  >
                    <TagPill
                      name={option.label}
                      group={option.group}
                      color={option.color}
                      shade={option.shade}
                      size="sm"
                    />
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
            {groups.map((group) => {
              const options = visible.filter(
                (option) => option.group.id === group.id,
              );
              if (!options.length) return null;
              return (
                <div key={group.id} role="group" aria-label={group.name}>
                  <p className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
                    {group.name}
                  </p>
                  {options.map((option) => (
                    <ComboboxItem
                      key={option.id}
                      value={option}
                      disabled={limitReached && !value.includes(option.id)}
                      className="py-2"
                    >
                      <TagPill
                        name={option.label}
                        group={option.group}
                        color={option.color}
                        shade={option.shade}
                        size="sm"
                      />
                    </ComboboxItem>
                  ))}
                </div>
              );
            })}
          </ComboboxList>
          {onCreate && normalized && !exactMatch && !limitReached ? (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start py-2 text-left"
                onClick={() => startCreation(suggestion)}
              >
                {suggestion
                  ? `Create ${suggestion.name} tag`
                  : `Create “${query.trim()}”`}
              </Button>
            </div>
          ) : null}
        </ComboboxContent>
      </Combobox>
      {limitReached ? (
        <p role="status" className="text-sm text-muted-foreground">
          Up to {PASSWORD_ENTRY_TAG_LIMIT} tags per entry. Remove a tag to
          choose another.
        </p>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}

      <Dialog
        open={creation !== undefined}
        onOpenChange={(open) => {
          if (!open && !creating) setCreation(undefined);
        }}
      >
        <DialogContent className="max-h-[min(48rem,90vh)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create tag</DialogTitle>
          </DialogHeader>
          {creation ? (
            <div className="space-y-6">
              {creationError ? (
                <p role="alert" className="text-sm text-destructive">
                  {creationError}
                </p>
              ) : null}
              <label className="space-y-2 text-sm font-medium">
                <span className="block">Name</span>
                <Input
                  autoFocus
                  value={creation.name}
                  maxLength={32}
                  disabled={creating}
                  onChange={(event) =>
                    setCreation({ ...creation, name: event.target.value })
                  }
                />
              </label>
              <TagVisualPicker
                groupId={creation.groupId}
                color={creation.color}
                shade={creation.shade}
                groups={groups}
                disabled={creating}
                onChange={(visual) => setCreation({ ...creation, ...visual })}
              />
              <div className="space-y-2">
                <p className="text-sm font-medium">Preview</p>
                <TagPill
                  name={creation.name || "Unnamed tag"}
                  group={getTagGroupPresentation(creation.groupId, groups)}
                  color={creation.color}
                  shade={creation.shade}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter showCloseButton={false}>
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={() => setCreation(undefined)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={creating || !creation?.name.trim()}
              onClick={() => void create()}
            >
              {creating ? "Creating…" : "Create tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Field>
  );
}
