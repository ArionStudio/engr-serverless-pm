import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  parseEntrySearch,
  matchesEntrySearch,
  entrySearchSuggestions,
} from "@/ui/features/entries/entry-search";
import { BrowserLoginsPanel } from "@/ui/features/entries/browser-logins.view";
import type { BrowserLoginCapabilities } from "@/ui/features/entries/browser-login.type";
import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";
import type { WorkspaceControls } from "@/ui/features/entries/workspace.type";
import { useWorkspace } from "@/ui/features/entries/use-workspace";
import { EntryList } from "@/ui/features/entries/entries.view";
import { SearchField } from "@/ui/features/entries/search-field.view";
import { EntryDetails } from "@/ui/features/entries/entry-details.view";
import { EntryEditor } from "@/ui/features/entries/entry-editor.view";
import type { EntryDraft } from "@/ui/features/entries/entry-form.view";
import { DestructiveConfirmation } from "@/ui/components/feedback/destructive-confirmation.view";
import { Button } from "@/ui/components/primitives/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { VaultIcon } from "@hugeicons/core-free-icons";
import type { GlobalLibrary } from "@lfspm/core";
import {
  getTagGroupPresentation,
  type TagGroupPresentation,
} from "@/ui/features/tags";
import { getEntryAccessibleName } from "@/ui/features/entries/entry-label";

type PopupEntryView = "list" | "details" | "editor" | "delete";

export function PopupEntries({
  vaultId,
  capabilities,
  browserLogins,
  section = "vault",
  initialDraft,
  onDraftConsumed,
  onStateChange,
  onOpenSync,
  onSessionLost,
  onLock,
  controlsRef,
}: {
  section?: "vault" | "detected";
  vaultId: string;
  capabilities: WorkspaceCapabilities;
  browserLogins?: BrowserLoginCapabilities;
  initialDraft?: EntryDraft;
  onDraftConsumed: () => void;
  onStateChange: (state: { view: PopupEntryView; pending: boolean }) => void;
  onOpenSync: () => void;
  onSessionLost?: () => void;
  onLock?: () => void | Promise<void>;
  controlsRef?: Ref<WorkspaceControls>;
}) {
  const [query, setQuery] = useState("");
  const clearQuery = useCallback(() => setQuery(""), []);
  const [browserPending, setBrowserPending] = useState(false);
  const live = useWorkspace(
    vaultId,
    capabilities,
    initialDraft,
    clearQuery,
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
  const content = useRef<HTMLElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!live.error) return;
    alert.current?.focus({ preventScroll: true });
    alert.current?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
  }, [live.error, live.view.kind]);
  const firstFocus = useRef(true);
  useEffect(() => {
    onStateChange({
      view: live.view.kind,
      pending: live.pending || browserPending,
    });
  }, [live.view.kind, live.pending, browserPending, onStateChange]);
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    content.current?.focus();
  }, [live.view.kind]);
  useEffect(() => {
    if (initialDraft) onDraftConsumed();
  }, [initialDraft, onDraftConsumed]);
  const {
    labels,
    tagGroups,
    tagOptions,
    folders,
    uncategorized,
    folderPresentations,
    suggestions,
  } = useMemo(() => {
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
    const suggestions = entrySearchSuggestions(
      live.data?.entries ?? [],
      labels,
      folderPresentations,
    );
    return {
      labels,
      tagGroups,
      tagOptions,
      folders,
      uncategorized,
      folderPresentations,
      suggestions,
    };
  }, [live.data]);
  const normalized = query.trim().toLocaleLowerCase();
  const terms = parseEntrySearch(query);
  const entries = (live.data?.entries ?? []).filter((entry) =>
    matchesEntrySearch(entry, terms, labels, folderPresentations),
  );
  const { view } = live;
  return (
    <section
      ref={content}
      tabIndex={-1}
      data-focus-target
      className="min-h-full outline-none"
      aria-label="Vault"
    >
      {live.feedback ? (
        <div
          role="status"
          className="mb-3 flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-xs"
        >
          <span>{live.feedback}</span>
          {live.uploadPending ? (
            <Button variant="outline" size="sm" onClick={onOpenSync}>
              Review sync in Options
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
          className="mb-4 space-y-3 text-sm text-destructive"
        >
          <p>{live.error}</p>
          <Button variant="outline" onClick={() => void live.refresh()}>
            Reload entries
          </Button>
        </div>
      ) : null}
      {view.kind === "editor" ? (
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
        <div className="space-y-4">
          {browserLogins ? (
            <BrowserLoginsPanel
              mode={section === "detected" ? "detected" : "matches"}
              onPendingChange={setBrowserPending}
              vaultId={vaultId}
              capabilities={browserLogins}
              onSessionLost={onSessionLost}
              onReview={(captured, entryId) => live.edit(entryId, captured)}
            />
          ) : null}
          {section === "vault" ? (
            <>
              <SearchField
                value={query}
                suggestions={suggestions}
                onChange={setQuery}
                onSubmit={() => {}}
                presentation="popup"
              />
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">
                  {normalized ? "Search results" : "All entries"}
                </h2>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {entries.length}
                </span>
              </div>
              {!live.loading && live.data?.entries.length === 0 ? (
                <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-5 text-center">
                  <span className="grid size-9 place-items-center rounded-md bg-muted text-muted-foreground">
                    <HugeiconsIcon
                      icon={VaultIcon}
                      size={18}
                      aria-hidden="true"
                    />
                  </span>
                  <h2 className="text-sm font-medium">No entries yet</h2>
                  <p className="max-w-64 text-sm text-muted-foreground">
                    Add a login for this website or another account.
                  </p>
                  <Button size="sm" onClick={() => live.edit()}>
                    Add entry
                  </Button>
                </div>
              ) : live.error && !live.data ? null : (
                <fieldset className="min-w-0" disabled={live.pending}>
                  <EntryList
                    entries={entries}
                    tagLabels={labels}
                    tagOptions={tagOptions}
                    folders={folderPresentations}
                    onOpen={live.open}
                    presentation="popup"
                    state={
                      live.loading && !live.data
                        ? "loading"
                        : live.error && !live.data
                          ? "error"
                          : "ready"
                    }
                    onRetry={() => void live.refresh()}
                  />
                </fieldset>
              )}
            </>
          ) : null}
        </div>
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
