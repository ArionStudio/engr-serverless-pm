import { SiteIcon } from "./site-icon.view";
import type { VisiblePasswordEntryFields } from "@lfspm/core";
import { Button } from "@/ui/components/primitives/button";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
} from "@/ui/components/primitives/item";
import { EmptyState } from "@/ui/components/layout/sections.view";
import { Skeleton } from "@/ui/components/primitives/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import { TagPill } from "@/ui/features/tags";
import { getFolderIcon } from "@/ui/features/folders";
import type { TagOption } from "./tag-selection.view";

export type EntryFolderPresentation = {
  readonly name: string;
  readonly icon: string;
};
export function EntryRow({
  entry,
  selected,
  onOpen,
  onSelect,
  tagLabels = {},
  tagOptions = {},
  folders = {},
  presentation = "default",
}: {
  entry: VisiblePasswordEntryFields;
  tagLabels?: Readonly<Record<string, string>>;
  tagOptions?: Readonly<Record<string, TagOption>>;
  folders?: Readonly<Record<string, EntryFolderPresentation>>;
  selected?: boolean;
  onOpen: (id: string) => void;
  onSelect?: (id: string) => void;
  presentation?: "default" | "popup";
}) {
  const popup = presentation === "popup" && !onSelect;
  const folder = folders[entry.folderId];
  return (
    <Item
      render={
        popup ? (
          <button
            type="button"
            className="cursor-pointer text-left"
            onClick={() => onOpen(entry.id)}
          />
        ) : undefined
      }
      variant={presentation === "popup" ? "muted" : "outline"}
      size={presentation === "popup" ? "xs" : "default"}
    >
      <SiteIcon url={entry.sanitizedUrl} />
      <ItemContent>
        <ItemTitle>
          {popup ? (
            <span className="min-w-0 text-sm whitespace-normal break-all text-foreground">
              {entry.login || "Unnamed login"}
            </span>
          ) : (
            <Button
              variant="link"
              className="h-auto min-w-0 justify-start px-0 text-left whitespace-normal break-all"
              onClick={() => onOpen(entry.id)}
            >
              {entry.login || "Unnamed login"}
            </Button>
          )}
        </ItemTitle>
        <ItemDescription className="break-all">
          {entry.sanitizedUrl}
        </ItemDescription>
        {folder ? (
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <HugeiconsIcon
              icon={getFolderIcon(folder.icon)}
              size={14}
              className="shrink-0"
              aria-hidden="true"
            />
            <span className="truncate">{folder.name}</span>
          </span>
        ) : null}
        <div
          className={
            presentation === "popup"
              ? "mt-1 flex flex-wrap gap-1"
              : "mt-2 flex flex-wrap gap-1"
          }
        >
          {entry.tags.map((tag) => {
            const option = tagOptions[tag];
            return option ? (
              <TagPill
                key={tag}
                name={option.label}
                group={option.group}
                color={option.color}
                shade={option.shade}
                size="sm"
              />
            ) : (
              <span
                key={tag}
                className="rounded-md border bg-muted/45 px-2 py-0.5 text-xs"
              >
                {tagLabels[tag] ?? "Unknown tag"}
              </span>
            );
          })}
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
  tagOptions,
  folders,
  presentation = "default",
}: {
  entries: readonly VisiblePasswordEntryFields[];
  tagLabels?: Readonly<Record<string, string>>;
  tagOptions?: Readonly<Record<string, TagOption>>;
  folders?: Readonly<Record<string, EntryFolderPresentation>>;
  selectedId?: string;
  onOpen: (id: string) => void;
  onSelect?: (id: string) => void;
  state?: "ready" | "loading" | "error";
  onRetry?: () => void;
  presentation?: "default" | "popup";
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
    <ItemGroup className={presentation === "popup" ? "gap-2" : "gap-3"}>
      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          tagLabels={tagLabels}
          tagOptions={tagOptions}
          folders={folders}
          selected={entry.id === selectedId}
          onOpen={onOpen}
          onSelect={onSelect}
          presentation={presentation}
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
