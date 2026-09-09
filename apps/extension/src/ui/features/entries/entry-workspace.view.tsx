import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import type { EntryDraft } from "./entry-form.view";
import type { GlobalLibrary } from "@lfspm/core";
import type { WorkspaceCapabilities } from "./workspace.type";
import type { WorkspaceControls } from "./workspace.type";
import { getEntryAccessibleName } from "./entry-label";
import { useWorkspace } from "./use-workspace";
import { EntryTable } from "./entry-table.view";
import { EntryDetails } from "./entry-details.view";
import { EntryEditor } from "./entry-editor.view";
import { DestructiveConfirmation } from "@/ui/components/feedback/destructive-confirmation.view";
import { Button } from "@/ui/components/primitives/button";
import { Spinner } from "@/ui/components/primitives/spinner";
import {
  getTagGroupPresentation,
  type TagGroupPresentation,
} from "@/ui/features/tags";

export function EntryWorkspace({
  vaultId,
  capabilities,
  onLock,
  onSessionLost,
  onSync,
  initialDraft,
  onDraftConsumed,
  controlsRef,
}: {
  vaultId: string;
  capabilities: WorkspaceCapabilities;
  onLock?: () => void | Promise<void>;
  onSessionLost?: () => void;
  onSync: () => void;
  initialDraft?: EntryDraft;
  onDraftConsumed?: () => void;
  controlsRef?: Ref<WorkspaceControls>;
}) {
  const [listGeneration, setListGeneration] = useState(0);
  const clearList = useCallback(() => setListGeneration((n) => n + 1), []);
  const live = useWorkspace(
    vaultId,
    capabilities,
    initialDraft,
    clearList,
    onSessionLost,
  );
  const { lock } = live;
  useImperativeHandle(
    controlsRef,
    () => ({
      lock: () => (onLock ? lock(onLock) : Promise.resolve()),
    }),
    [lock, onLock],
  );
  const [organizationLibrary, setOrganizationLibrary] =
    useState<GlobalLibrary>();
  useEffect(() => {
    let active = true;
    void capabilities.readOrganizationLibrary().then(
      (library) => {
        if (active) setOrganizationLibrary(library);
      },
      () => {
        if (active) setOrganizationLibrary(undefined);
      },
    );
    return () => {
      active = false;
    };
  }, [capabilities]);
  useEffect(() => {
    if (initialDraft) onDraftConsumed?.();
  }, [initialDraft, onDraftConsumed]);
  const content = useRef<HTMLElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !live.error ||
      live.view.kind === "editor" ||
      live.view.kind === "delete"
    )
      return;
    alert.current?.focus({ preventScroll: true });
    alert.current?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
  }, [live.error, live.view.kind]);
  const firstFocus = useRef(true);
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    if (live.error) return;
    content.current?.focus();
  }, [live.error, live.view.kind]);
  const labels = Object.fromEntries(
    (live.data?.tags ?? []).map((tag) => [tag.id, tag.name]),
  );
  const tagGroups = (live.data?.tagGroups ??
    []) as readonly TagGroupPresentation[];
  const tagOptions = Object.fromEntries(
    (live.data?.tags ?? []).map((tag) => [
      tag.id,
      {
        id: tag.id,
        label: tag.name,
        group: getTagGroupPresentation(tag.groupId, tagGroups),
        color: tag.color,
        shade: tag.shade,
      },
    ]),
  );
  const folders = (live.data?.folders ?? []).map((folder) => ({
    ...folder,
    entryCount: (live.data?.entries ?? []).filter(
      (entry) => entry.folderId === folder.id,
    ).length,
    childCount: (live.data?.folders ?? []).filter(
      (candidate) => candidate.parentId === folder.id,
    ).length,
  }));
  const uncategorized = {
    id: "uncategorized" as const,
    name: "Uncategorized" as const,
    entryCount: (live.data?.entries ?? []).filter(
      (entry) => entry.folderId === "uncategorized",
    ).length,
  };
  const folderPresentations = Object.fromEntries([
    ...folders.map(
      (folder) =>
        [folder.id, { name: folder.name, icon: folder.icon }] as const,
    ),
    [uncategorized.id, { name: uncategorized.name, icon: "folder" }] as const,
  ]);
  const { view } = live;
  return (
    <section
      ref={content}
      tabIndex={-1}
      data-focus-target
      className="space-y-6 outline-none"
      aria-label="Vault workspace"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Entries</h1>
        <div className="flex flex-wrap gap-2">
          {onLock && !controlsRef ? (
            <Button variant="outline" onClick={() => live.lock(onLock)}>
              Lock vault
            </Button>
          ) : null}
          {view.kind === "list" ? (
            <Button
              disabled={live.pending || !live.data}
              onClick={() => live.edit()}
            >
              Add entry
            </Button>
          ) : null}
        </div>
      </header>
      {live.feedback ? (
        <div role="status" className="rounded-lg border p-4 text-sm">
          {live.feedback}
          {live.uploadPending ? (
            <Button className="ml-3" variant="outline" onClick={onSync}>
              Review sync
            </Button>
          ) : null}
        </div>
      ) : null}
      {live.error && view.kind !== "editor" && view.kind !== "delete" ? (
        <div
          ref={alert}
          role="alert"
          tabIndex={-1}
          data-focus-target
          className="space-y-3 text-sm text-destructive"
        >
          <p>{live.error}</p>
          <Button variant="outline" onClick={() => void live.refresh()}>
            Reload entries
          </Button>
          <Button variant="outline" onClick={onSync}>
            Open sync
          </Button>
        </div>
      ) : null}
      {view.kind === "editor" ? (
        <>
          <EntryEditor
            key={view.key}
            initial={view.initial}
            mode={view.entryId ? "edit" : "add"}
            tags={(live.data?.tags ?? []).map((tag) => ({
              id: tag.id,
              label: tag.name,
              group: getTagGroupPresentation(tag.groupId, tagGroups),
              color: tag.color,
              shade: tag.shade,
            }))}
            tagGroups={tagGroups}
            tagSuggestions={organizationLibrary?.tags}
            folderSuggestions={organizationLibrary?.folders}
            folders={folders}
            uncategorized={uncategorized}
            onCreateTag={async (tag) => {
              const result = await live.createTag(tag);
              return { id: result.tagId };
            }}
            onCreateFolder={async (folder) => {
              const result = await live.createFolder(folder);
              return { id: result.folderId };
            }}
            tools={capabilities.tools}
            pending={live.pending}
            error={live.error}
            onSave={live.save}
            onCancel={live.back}
          />
          {live.stale ? (
            <Button
              variant="outline"
              disabled={live.pending}
              onClick={() => live.edit(view.entryId)}
            >
              Discard draft and reload
            </Button>
          ) : null}
        </>
      ) : view.kind === "details" ? (
        <EntryDetails
          entry={view.record.entry}
          tagLabels={labels}
          tagOptions={tagOptions}
          folders={folderPresentations}
          password={live.password}
          revealing={live.revealing}
          disabled={live.pending}
          copyState={live.copyState}
          onReveal={live.reveal}
          onHide={live.hide}
          onCopy={live.copy}
          onBack={live.back}
          onEdit={() => live.edit(view.record.entry.id)}
          onDelete={() => live.open(view.record.entry.id, "delete")}
        />
      ) : (
        <>
          {live.pending ? (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Spinner />
              Opening entry…
            </p>
          ) : null}
          <fieldset
            disabled={live.pending || view.kind === "delete"}
            className="min-w-0"
          >
            <EntryTable
              key={listGeneration}
              entries={live.data?.entries ?? []}
              tagLabels={labels}
              tagOptions={tagOptions}
              folders={folderPresentations}
              state={
                live.loading && !live.data
                  ? "loading"
                  : !live.data && live.error
                    ? "error"
                    : "ready"
              }
              onOpen={live.open}
              onEdit={live.edit}
              onRemove={(id) => live.open(id, "delete")}
              onCreate={() => live.edit()}
              onRetry={() => void live.refresh()}
            />
          </fieldset>
        </>
      )}
      {view.kind === "delete" ? (
        <DestructiveConfirmation
          open
          onOpenChange={(open) => {
            if (!open) live.back();
          }}
          action="Delete entry"
          identity={getEntryAccessibleName(view.record.entry)}
          consequences={
            live.data?.syncConfigured
              ? "This deletes the entry from this vault and attempts to upload the change. If the upload remains pending, retry it in Sync. Other browsers receive the deletion after it uploads and they sync."
              : "This permanently deletes the entry from this vault."
          }
          onConfirm={live.remove}
          pending={live.pending}
          error={live.error}
        />
      ) : null}
    </section>
  );
}
