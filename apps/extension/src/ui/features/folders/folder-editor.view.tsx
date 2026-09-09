import { useId, useState } from "react";
import type { GlobalFolderDefinition } from "@lfspm/core";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/ui/components/primitives/button";
import { TextField } from "@/ui/components/forms/fields.view";
import { GuidancePanel } from "@/ui/components/feedback/guidance-panel.view";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/ui/components/primitives/radio-group";
import { Spinner } from "@/ui/components/primitives/spinner";
import { folderIconChoices } from "./folder-presentation";

export type FolderDraft = {
  name: string;
  icon: string;
  description?: string;
};

export function FolderEditor({
  mode = "add",
  initial = { name: "", icon: "folder", description: "" },
  parentName,
  deepNesting = false,
  pending = false,
  error,
  suggestions = [],
  onSuggestionSelected,
  onSubmit,
  onCancel,
}: {
  mode?: "add" | "edit";
  initial?: FolderDraft;
  parentName?: string;
  deepNesting?: boolean;
  pending?: boolean;
  error?: string;
  suggestions?: readonly GlobalFolderDefinition[];
  onSuggestionSelected?: (suggestion: GlobalFolderDefinition) => void;
  onSubmit: (draft: FolderDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [nameError, setNameError] = useState<string>();
  const id = useId();
  const [selectedSuggestion, setSelectedSuggestion] = useState<string>();
  const query = draft.name.trim().toLocaleLowerCase();
  const suggestion =
    mode === "add" && query
      ? suggestions.find((candidate) =>
          candidate.name.toLocaleLowerCase().includes(query),
        )
      : undefined;
  function submit() {
    if (pending) return;
    const name = draft.name.trim();
    if (!name) {
      setNameError("Enter a folder name.");
      return;
    }
    onSubmit({
      name,
      icon: draft.icon,
      description: draft.description?.trim() || undefined,
    });
  }
  return (
    <form
      className="max-w-2xl space-y-5 rounded-lg border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h2 className="text-lg font-semibold">
        {mode === "add" ? "New folder" : "Edit folder"}
      </h2>
      <TextField
        label="Name"
        value={draft.name}
        maxLength={64}
        disabled={pending}
        error={nameError}
        onChange={(event) => {
          setDraft({ ...draft, name: event.target.value });
          setNameError(undefined);
        }}
      />
      {suggestion && suggestion.id !== selectedSuggestion ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setDraft({
              name: suggestion.name,
              icon: suggestion.icon,
              description: suggestion.description,
            });
            setNameError(undefined);
            setSelectedSuggestion(suggestion.id);
            onSuggestionSelected?.(suggestion);
          }}
        >
          Use {suggestion.name} folder
        </Button>
      ) : null}
      <TextField
        label="Description"
        description="Optional. Describes what belongs in this folder."
        value={draft.description ?? ""}
        maxLength={256}
        disabled={pending}
        onChange={(event) =>
          setDraft({ ...draft, description: event.target.value })
        }
      />
      <fieldset disabled={pending} className="space-y-3">
        <legend className="text-sm font-medium">Icon</legend>
        <RadioGroup
          value={draft.icon}
          disabled={pending}
          className="grid grid-cols-2 gap-2 @lg:grid-cols-4"
          onValueChange={(icon) => {
            if (typeof icon === "string") setDraft({ ...draft, icon });
          }}
        >
          {folderIconChoices.map((choice) => {
            const labelId = `${id}-icon-${choice.id}`;
            return (
              <label
                key={choice.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 has-data-checked:border-primary has-data-checked:bg-accent"
              >
                <RadioGroupItem
                  value={choice.id}
                  disabled={pending}
                  aria-labelledby={labelId}
                />
                <HugeiconsIcon
                  icon={choice.icon}
                  size={17}
                  aria-hidden="true"
                />
                <span id={labelId} className="text-sm">
                  {choice.label}
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </fieldset>
      <dl className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Location</dt>
          <dd className="font-medium">{parentName ?? "Vault root"}</dd>
        </div>
      </dl>
      {deepNesting ? (
        <GuidancePanel title="Deep folder nesting" variant="warning">
          <p>Folders deeper than two levels may be harder to navigate.</p>
        </GuidancePanel>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          {mode === "add" ? "Create folder" : "Save folder"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
