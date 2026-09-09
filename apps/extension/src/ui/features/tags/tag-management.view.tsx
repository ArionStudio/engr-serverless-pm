import { useCallback, useId, useState } from "react";
import type {
  ReadTagsResult,
  TagColor,
  TagGroupId,
  TagShade,
} from "@lfspm/core";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  Edit02Icon,
  TagsIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/ui/components/primitives/button";
import { TextField } from "@/ui/components/forms/fields.view";
import { Spinner } from "@/ui/components/primitives/spinner";
import { DestructiveConfirmation } from "@/ui/components/feedback/destructive-confirmation.view";
import { GuidancePanel } from "@/ui/components/feedback/guidance-panel.view";
import type { TagManagementCapabilities } from "./tag-management.type";
import { useTagManagement } from "./use-tag-management";
import { TagGroupHeading, TagPill, TagVisualPicker } from "./tag-visuals.view";
import {
  getTagGroupPresentation,
  tagGroupPresentations,
  type TagGroupPresentation,
} from "./tag-presentation";
type ManagedTag = ReadTagsResult["tags"][number];
type TagDraft = {
  name: string;
  groupId: TagGroupId;
  color: TagColor;
  shade: TagShade;
};
const emptyDraft: TagDraft = {
  name: "",
  groupId: "other",
  color: "gray",
  shade: 500,
};

function TagEditor({
  initial,
  pending,
  error,
  groups,
  onSave,
  onCancel,
}: {
  initial: TagDraft;
  pending: boolean;
  error?: string;
  groups: readonly TagGroupPresentation[];
  onSave: (draft: TagDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [nameError, setNameError] = useState<string>();
  const id = useId();
  function submit() {
    if (pending) return;
    if (!draft.name.trim()) {
      setNameError("Enter a tag name.");
      return;
    }
    onSave({ ...draft, name: draft.name.trim() });
  }
  return (
    <form
      className="max-w-xl space-y-5 rounded-lg border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h2 className="text-lg font-semibold">
        {initial.name ? "Edit tag" : "New tag"}
      </h2>
      <TextField
        label="Name"
        value={draft.name}
        maxLength={32}
        disabled={pending}
        error={nameError}
        onChange={(event) => {
          setDraft({ ...draft, name: event.target.value });
          setNameError(undefined);
        }}
      />
      <TagVisualPicker
        groupId={draft.groupId}
        color={draft.color}
        shade={draft.shade}
        groups={groups}
        disabled={pending}
        onChange={(visuals) => setDraft({ ...draft, ...visuals })}
      />
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="text-xs font-medium text-muted-foreground">
          Preview
        </span>
        <TagPill
          name={draft.name.trim() || "New tag"}
          color={draft.color}
          shade={draft.shade}
          group={getTagGroupPresentation(draft.groupId, groups)}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          {initial.name ? "Save tag" : "Create tag"}
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

export function TagManagementView({
  vaultId,
  capabilities,
  groups,
  onSessionLost,
}: {
  vaultId: string;
  capabilities: TagManagementCapabilities;
  groups?: readonly TagGroupPresentation[];
  onSessionLost?: () => void;
}) {
  const [editor, setEditor] = useState<ManagedTag | "new">();
  const [removing, setRemoving] = useState<ManagedTag>();
  const clearAuthorizationState = useCallback(() => {
    setEditor(undefined);
    setRemoving(undefined);
    onSessionLost?.();
  }, [onSessionLost]);
  const live = useTagManagement(vaultId, capabilities, clearAuthorizationState);
  const visibleGroups = groups ?? live.tagGroups ?? tagGroupPresentations;
  const closeEditor = () => {
    live.clearMutationError();
    setEditor(undefined);
  };
  const openEditor = (tag: ManagedTag | "new") => {
    live.clearMutationError();
    setEditor(tag);
  };
  const changeRemoval = (tag?: ManagedTag) => {
    live.clearMutationError();
    setRemoving(tag);
  };
  return (
    <section className="max-w-4xl space-y-6" aria-label="Tag management">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
        {!editor ? (
          <Button onClick={() => openEditor("new")} disabled={live.pending}>
            <HugeiconsIcon icon={Add01Icon} size={17} aria-hidden="true" />
            New tag
          </Button>
        ) : null}
      </div>
      {live.readError ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="min-w-0 flex-1 text-sm text-destructive">
            {live.readError}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={live.loading || live.pending}
            onClick={() => void live.refresh()}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {live.mutationError && !editor && !removing ? (
        <p role="alert" className="text-sm text-destructive">
          {live.mutationError}
        </p>
      ) : null}
      {live.feedback ? (
        <p role="status" className="text-sm text-muted-foreground">
          {live.feedback}
        </p>
      ) : null}
      {live.softLimitReached ? (
        <GuidancePanel
          title={`${live.tags.length} tags in this vault`}
          variant="warning"
        >
          <p>
            The suggested limit is {live.softLimit}. Reuse an existing tag or
            remove an unused one when possible.
          </p>
        </GuidancePanel>
      ) : null}
      {editor ? (
        <TagEditor
          key={editor === "new" ? "new" : editor.id}
          initial={
            editor === "new"
              ? emptyDraft
              : {
                  name: editor.name,
                  groupId: editor.groupId,
                  color: editor.color,
                  shade: editor.shade,
                }
          }
          pending={live.pending}
          error={live.mutationError}
          groups={visibleGroups}
          onCancel={closeEditor}
          onSave={(tag) => {
            void (
              editor === "new"
                ? live.add({ vaultId, tag })
                : live.update({
                    vaultId,
                    tagId: editor.id,
                    expectedTagVersionVector: editor.versionVector,
                    tag,
                  })
            ).then((saved) => {
              if (saved) closeEditor();
            });
          }}
        />
      ) : live.loading && !live.hasData ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Spinner /> Loading tags…
        </p>
      ) : live.readError && !live.hasData ? null : live.tags.length === 0 ? (
        <div className="grid min-h-48 place-items-center rounded-lg border border-dashed p-6 text-center">
          <div className="space-y-3">
            <HugeiconsIcon
              icon={TagsIcon}
              size={28}
              className="mx-auto text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="font-semibold">No tags yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Tags group related entries and make them easier to find.
            </p>
            <Button onClick={() => openEditor("new")}>Create a tag</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {visibleGroups.map((group) => {
            const tags = live.tags.filter((tag) => tag.groupId === group.id);
            if (!tags.length) return null;
            const headingId = `tag-group-heading-${group.id}`;
            return (
              <section
                key={group.id}
                className="rounded-lg border bg-card p-4"
                aria-labelledby={headingId}
              >
                <TagGroupHeading
                  id={headingId}
                  group={group}
                  count={tags.length}
                />
                <ul className="space-y-2">
                  {tags.map((tag) => (
                    <li
                      key={tag.id}
                      className="flex flex-wrap items-center gap-3 rounded-md bg-muted/40 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <TagPill
                          name={tag.name}
                          color={tag.color}
                          shade={tag.shade}
                          group={group}
                        />
                        <p className="text-xs text-muted-foreground">
                          {tag.entryCount === 1
                            ? "Used by 1 entry"
                            : `Used by ${tag.entryCount} entries`}
                          {tag.entryCount > 0
                            ? ". Remove it from entries to delete this tag."
                            : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Edit ${tag.name}`}
                        title={`Edit ${tag.name}`}
                        disabled={live.pending}
                        onClick={() => openEditor(tag)}
                      >
                        <HugeiconsIcon
                          icon={Edit02Icon}
                          size={16}
                          aria-hidden="true"
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Delete ${tag.name}`}
                        title={
                          tag.entryCount
                            ? tag.entryCount === 1
                              ? "Used by 1 entry"
                              : `Used by ${tag.entryCount} entries`
                            : `Delete ${tag.name}`
                        }
                        disabled={live.pending || tag.entryCount > 0}
                        onClick={() => changeRemoval(tag)}
                      >
                        <HugeiconsIcon
                          icon={Delete02Icon}
                          size={16}
                          aria-hidden="true"
                        />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {removing ? (
        <DestructiveConfirmation
          open
          action="Delete tag"
          identity={removing.name}
          consequences="This removes the tag from this vault. A deleted tag cannot be selected for entries."
          pending={live.pending}
          error={live.mutationError}
          onOpenChange={(open) => {
            if (!open) changeRemoval();
          }}
          onConfirm={() => {
            void live
              .remove({
                vaultId,
                tagId: removing.id,
                expectedTagVersionVector: removing.versionVector,
              })
              .then((removed) => {
                if (removed) changeRemoval();
              });
          }}
        />
      ) : null}
    </section>
  );
}
