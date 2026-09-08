import { SearchField } from "./search-field.view";
import { SiteIcon } from "./site-icon.view";
import { useId, useMemo, useState } from "react";
import type { VisiblePasswordEntryFields } from "@lfspm/core";
import {
  useTable,
  createColumnHelper,
  tableFeatures,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  sortFn_text,
} from "@tanstack/react-table";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  MoreHorizontalCircle01Icon,
} from "@hugeicons/core-free-icons";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/components/primitives/table";
import { Button } from "@/ui/components/primitives/button";
import { Checkbox } from "@/ui/components/primitives/checkbox";
import { FieldLabel } from "@/ui/components/primitives/field";
import { Skeleton } from "@/ui/components/primitives/skeleton";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from "@/ui/components/primitives/dropdown-menu";
import { EmptyState } from "@/ui/components/layout/sections.view";
import "./entry-table.css";
import { TagPill } from "@/ui/features/tags";
import { getFolderIcon } from "@/ui/features/folders";
import type { TagOption } from "./tag-selection.view";
import type { EntryFolderPresentation } from "./entries.view";
const features = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text },
});
const emptyTagLabels: Readonly<Record<string, string>> = {};
const emptyTagOptions: Readonly<Record<string, TagOption>> = {};
const emptyFolders: Readonly<Record<string, EntryFolderPresentation>> = {};
const helper = createColumnHelper<
  typeof features,
  VisiblePasswordEntryFields
>();
function SelectionCheckbox({
  label,
  checked,
  indeterminate = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <FieldLabel id={id} className="inline-flex p-1">
      <Checkbox
        aria-labelledby={id}
        checked={checked}
        indeterminate={indeterminate}
        onCheckedChange={onChange}
      />
      <span className="sr-only">{label}</span>
    </FieldLabel>
  );
}
function createColumns(
  tagLabels: Readonly<Record<string, string>>,
  tagOptions: Readonly<Record<string, TagOption>>,
  folders: Readonly<Record<string, EntryFolderPresentation>>,
  multiple: boolean,
) {
  return helper.columns([
    helper.display({
      id: "select",
      enableHiding: false,
      header: ({ table }) =>
        multiple ? (
          <SelectionCheckbox
            label="Select this page"
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={
              table.getIsSomePageRowsSelected() &&
              !table.getIsAllPageRowsSelected()
            }
            onChange={(value) => table.toggleAllPageRowsSelected(value)}
          />
        ) : (
          "Select"
        ),
      cell: ({ row }) => (
        <SelectionCheckbox
          label={`Select ${row.original.login}`}
          checked={row.getIsSelected()}
          onChange={(value) => row.toggleSelected(value)}
        />
      ),
    }),
    helper.accessor("login", {
      header: "Login",
      sortFn: "text",
      enableHiding: false,
      cell: (info) => (
        <span className="flex items-center gap-2 font-medium">
          <SiteIcon url={info.row.original.sanitizedUrl} />
          <span>{info.getValue() || "Unnamed login"}</span>
        </span>
      ),
    }),
    helper.accessor("sanitizedUrl", {
      header: "Website",
      sortFn: "text",
      cell: (info) => (
        <span className="text-muted-foreground">
          {info.getValue() || "No website"}
        </span>
      ),
    }),
    helper.accessor((row) => folders[row.folderId]?.name ?? "Uncategorized", {
      id: "folder",
      header: "Folder",
      sortFn: "text",
      cell: ({ row }) => {
        const folder = folders[row.original.folderId];
        return (
          <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <HugeiconsIcon
              icon={getFolderIcon(folder?.icon ?? "folder")}
              size={16}
              className="shrink-0"
              aria-hidden="true"
            />
            <span className="truncate">{folder?.name ?? "Uncategorized"}</span>
          </span>
        );
      },
    }),
    helper.accessor(
      (row) => row.tags.map((id) => tagLabels[id] ?? "Unknown tag").join(", "),
      {
        id: "tags",
        header: "Tags",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.tags.length ? (
              row.original.tags.map((tag) => {
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
              })
            ) : (
              <span className="text-muted-foreground">No tags</span>
            )}
          </div>
        ),
      },
    ),
  ]);
}
export function EntryTable({
  entries,
  onOpen,
  onEdit,
  onRemove,
  onReviewSelection,
  onRetry,
  onCreate,
  tagLabels = emptyTagLabels,
  tagOptions = emptyTagOptions,
  folders = emptyFolders,
  state = "ready",
}: {
  entries: readonly VisiblePasswordEntryFields[];
  tagLabels?: Readonly<Record<string, string>>;
  tagOptions?: Readonly<Record<string, TagOption>>;
  folders?: Readonly<Record<string, EntryFolderPresentation>>;
  onOpen: (id: string) => void;
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
  onReviewSelection?: (ids: string[]) => void;
  onRetry?: () => void;
  onCreate?: () => void;
  state?: "ready" | "loading" | "error";
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const controlsId = useId();
  const available = state === "ready";
  // Copy approved fields before search or table state can retain row objects.
  const displayData = useMemo(
    () =>
      entries.map(
        ({ id, login, sanitizedUrl, tags, folderId, hasPassword }) => ({
          id,
          hasPassword,
          login,
          sanitizedUrl,
          tags: [...tags],
          folderId,
        }),
      ),
    [entries],
  );
  const normalized = query.trim().toLowerCase();
  const data = useMemo(
    () =>
      available
        ? displayData.filter(
            (entry) =>
              (!tag || entry.tags.includes(tag)) &&
              [
                entry.login,
                entry.sanitizedUrl,
                folders[entry.folderId]?.name ?? "Uncategorized",
                ...entry.tags.map((id) => tagLabels[id] ?? ""),
              ].some((value) => value.toLowerCase().includes(normalized)),
          )
        : [],
    [displayData, normalized, tag, tagLabels, folders, available],
  );
  const columns = useMemo(
    () => createColumns(tagLabels, tagOptions, folders, !!onReviewSelection),
    [tagLabels, tagOptions, folders, onReviewSelection],
  );
  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => row.id,
    enableMultiRowSelection: !!onReviewSelection,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  });
  const rows = table.getRowModel().rows;
  const selected = table.getSelectedRowModel().rows.map((row) => row.id);
  const page = table.state.pagination;
  const hasFilters = !!query || !!tag;
  function changeFilters(nextQuery: string, nextTag: string) {
    setQuery(nextQuery);
    setTag(nextTag);
    table.resetRowSelection();
    table.setPageIndex(0);
  }
  const availableTagOptions = Object.entries(tagLabels).filter(([id]) =>
    displayData.some((entry) => entry.tags.includes(id)),
  );
  return (
    <section
      className="entry-table space-y-4"
      aria-label="Entries table"
      aria-busy={state === "loading"}
    >
      <div className="entry-table-toolbar flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <SearchField
            onSubmit={() => {}}
            value={query}
            disabled={!available}
            onChange={(value) => changeFilters(value, tag)}
          />
        </div>
        <label
          className="space-y-2 text-xs font-medium"
          htmlFor={`${controlsId}-tags`}
        >
          <span className="block">Tag</span>
          <NativeSelect
            id={`${controlsId}-tags`}
            value={tag}
            disabled={!available}
            onChange={(e) => changeFilters(query, e.target.value)}
          >
            <NativeSelectOption value="">All tags</NativeSelectOption>
            {availableTagOptions.map(([id, label]) => (
              <NativeSelectOption key={id} value={id}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" disabled={!available} />}
          >
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllLeafColumns()
              .filter((col) => col.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(value)}
                >
                  {column.id === "tags"
                    ? "Tags"
                    : column.id === "folder"
                      ? "Folder"
                      : "Website"}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {hasFilters ? (
          <Button
            variant="ghost"
            disabled={!available}
            onClick={() => changeFilters("", "")}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
      <div className="entry-table-mobile-sort">
        <label
          className="flex flex-wrap items-center gap-2 text-xs"
          htmlFor={`${controlsId}-sort`}
        >
          Sort
          <NativeSelect
            id={`${controlsId}-sort`}
            disabled={!available}
            value={
              table.state.sorting[0]
                ? `${table.state.sorting[0].id}:${table.state.sorting[0].desc ? "desc" : "asc"}`
                : "none"
            }
            onChange={(e) => {
              const [id, direction] = e.target.value.split(":");
              table.setSorting(
                id === "none" ? [] : [{ id, desc: direction === "desc" }],
              );
            }}
          >
            <NativeSelectOption value="none">Original order</NativeSelectOption>
            <NativeSelectOption value="login:asc">Login A–Z</NativeSelectOption>
            <NativeSelectOption value="login:desc">
              Login Z–A
            </NativeSelectOption>
            <NativeSelectOption value="sanitizedUrl:asc">
              Website A–Z
            </NativeSelectOption>
            <NativeSelectOption value="sanitizedUrl:desc">
              Website Z–A
            </NativeSelectOption>
          </NativeSelect>
        </label>
      </div>
      {available && selected.length ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted px-3 py-2">
          <span className="text-sm">{selected.length} selected</span>
          <Button
            size="sm"
            onClick={() =>
              onReviewSelection
                ? onReviewSelection(selected)
                : onOpen(selected[0])
            }
          >
            {onReviewSelection ? "Review selected" : "Open selected"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => table.resetRowSelection()}
          >
            Clear selection
          </Button>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg border">
        {state === "loading" ? (
          <div role="status" className="space-y-4 p-5">
            <span className="sr-only">Loading entries</span>
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-12" />
            ))}
          </div>
        ) : state === "error" ? (
          <EmptyState
            title="Entries could not be loaded"
            description="Try loading the vault again. Your saved entries have not been changed."
            action="Try again"
            onAction={onRetry}
          />
        ) : !data.length ? (
          <EmptyState
            title={
              hasFilters
                ? "No matching entries"
                : "Your vault has no entries yet"
            }
            description={
              hasFilters
                ? "Try another login, website or tag, or clear your filters."
                : "Add your first login to keep it here."
            }
            action={hasFilters ? "Clear filters" : "Add entry"}
            onAction={hasFilters ? () => changeFilters("", "") : onCreate}
          />
        ) : (
          <Table role="table">
            <TableCaption className="sr-only">Vault entries</TableCaption>
            <TableHeader role="rowgroup">
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} role="row">
                  {group.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      role="columnheader"
                      className="h-11 bg-muted/30"
                      aria-sort={
                        header.column.getIsSorted() === "asc"
                          ? "ascending"
                          : header.column.getIsSorted() === "desc"
                            ? "descending"
                            : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          <HugeiconsIcon
                            aria-hidden="true"
                            size={14}
                            icon={
                              header.column.getIsSorted() === "desc"
                                ? ArrowDown01Icon
                                : ArrowUp01Icon
                            }
                            className={
                              header.column.getIsSorted()
                                ? ""
                                : "text-muted-foreground"
                            }
                          />
                        </Button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  ))}
                  <TableHead role="columnheader" className="h-11 bg-muted/30">
                    <span className="sr-only">Entry actions</span>
                  </TableHead>
                </TableRow>
              ))}
            </TableHeader>
            <TableBody role="rowgroup">
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  role="row"
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      role="cell"
                      data-column={cell.column.id}
                      className="max-w-64 px-3 py-4 whitespace-normal break-words [overflow-wrap:anywhere]"
                    >
                      {["tags", "sanitizedUrl"].includes(cell.column.id) ? (
                        <span className="entry-table-mobile-label">
                          {cell.column.id === "tags" ? "Tags" : "Website"}
                        </span>
                      ) : null}
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                  <TableCell
                    role="cell"
                    data-column="actions"
                    className="px-3 py-4"
                  >
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Open ${row.original.login}`}
                        onClick={() => onOpen(row.id)}
                      >
                        Open
                      </Button>
                      {onEdit || onRemove ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${row.original.login}`}
                              />
                            }
                          >
                            <HugeiconsIcon
                              icon={MoreHorizontalCircle01Icon}
                              aria-hidden="true"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {onEdit ? (
                              <DropdownMenuItem onClick={() => onEdit(row.id)}>
                                Edit entry
                              </DropdownMenuItem>
                            ) : null}
                            {onRemove ? (
                              <DropdownMenuItem
                                onClick={() => onRemove(row.id)}
                              >
                                Review removal
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-muted-foreground">
          {available
            ? `${data.length} ${data.length === 1 ? "entry" : "entries"} · ${selected.length} selected · Page ${page.pageIndex + 1} of ${Math.max(1, table.getPageCount())}`
            : state === "loading"
              ? "Loading vault entries…"
              : "Entry list unavailable"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="flex items-center gap-2 text-xs"
            htmlFor={`${controlsId}-size`}
          >
            Rows per page
            <NativeSelect
              id={`${controlsId}-size`}
              value={page.pageSize}
              disabled={!available}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value));
                table.setPageIndex(0);
              }}
            >
              {[10, 25, 50].map((size) => (
                <NativeSelectOption key={size} value={size}>
                  {size}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <Button
            variant="outline"
            disabled={!available || !table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={!available || !table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
