import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";
import { useWorkspace } from "@/ui/features/entries/use-workspace";
import { EntryList, SearchField } from "@/ui/features/entries/entries.view";
import { EntryDetails } from "@/ui/features/entries/entry-details.view";
import { Button } from "@/ui/components/primitives/button";

export function PopupEntries({
  vaultId,
  capabilities,
  onLock,
  onSessionLost,
}: {
  vaultId: string;
  capabilities: WorkspaceCapabilities;
  onLock: () => void | Promise<void>;
  onSessionLost?: () => void;
}) {
  const [query, setQuery] = useState("");
  const clearQuery = useCallback(() => setQuery(""), []);
  const live = useWorkspace(vaultId, capabilities, clearQuery, onSessionLost);
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
  const normalized = query.trim().toLocaleLowerCase();
  const entries = (live.data?.entries ?? []).filter((entry) =>
    [
      entry.login,
      entry.sanitizedUrl,
      ...entry.tags.map((id) => labels[id] ?? ""),
    ].some((text) => text.toLocaleLowerCase().includes(normalized)),
  );
  return (
    <section
      ref={content}
      tabIndex={-1}
      data-focus-target
      className="space-y-5 outline-none"
      aria-label="Quick access"
    >
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Entries</h1>
        <Button variant="outline" onClick={() => live.lock(onLock)}>
          Lock vault
        </Button>
      </header>
      {live.error ? (
        <p role="alert" className="text-sm text-destructive">
          {live.error}
        </p>
      ) : null}
      {live.view.kind === "details" ? (
        <EntryDetails
          entry={live.view.record.entry}
          tagLabels={labels}
          password={live.password}
          revealing={live.revealing}
          disabled={live.pending}
          copyState={live.copyState}
          onReveal={live.reveal}
          onHide={live.hide}
          onCopy={live.copy}
          onBack={live.back}
        />
      ) : (
        <>
          <SearchField
            value={query}
            onChange={setQuery}
            onSubmit={() => {}}
            summary={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
          />
          {!live.loading && live.data?.entries.length === 0 ? (
            <h2 className="text-base font-medium">No entries yet</h2>
          ) : (
            <fieldset className="min-w-0" disabled={live.pending}>
              <EntryList
                entries={entries}
                tagLabels={labels}
                onOpen={live.open}
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
      )}
    </section>
  );
}
