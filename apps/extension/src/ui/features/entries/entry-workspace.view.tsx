import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceCapabilities } from "./workspace.type";
import { useWorkspace } from "./use-workspace";
import { EntryTable } from "./entry-table.view";
import { EntryDetails } from "./entry-details.view";
import { EntryEditor } from "./entry-editor.view";
import { DestructiveConfirmation } from "@/ui/components/feedback/destructive-confirmation.view";
import { Button } from "@/ui/components/primitives/button";
import { Spinner } from "@/ui/components/primitives/spinner";

export function EntryWorkspace({
  vaultId,
  capabilities,
  onLock,
  onSessionLost,
  onSync,
}: {
  vaultId: string;
  capabilities: WorkspaceCapabilities;
  onLock: () => void | Promise<void>;
  onSessionLost?: () => void;
  onSync: () => void;
}) {
  const [listGeneration, setListGeneration] = useState(0);
  const clearList = useCallback(() => setListGeneration((n) => n + 1), []);
  const live = useWorkspace(vaultId, capabilities, clearList, onSessionLost);
  const content = useRef<HTMLElement>(null);
  const firstFocus = useRef(true);
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    content.current?.focus();
  }, [live.view.kind]);
  const labels = Object.fromEntries(
    (live.data?.tags ?? []).map((tag) => [tag.id, tag.name]),
  );
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
          <Button variant="outline" onClick={() => live.lock(onLock)}>
            Lock vault
          </Button>
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
        <div role="alert" className="space-y-3 text-sm text-destructive">
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
            }))}
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
          identity={`${view.record.entry.login} · ${view.record.entry.sanitizedUrl}`}
          consequences={
            live.data?.syncConfigured
              ? "This deletes the entry from this vault and attempts to upload the change. If the upload remains pending, retry it in Sync. Other devices receive the deletion after it uploads and they sync."
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
