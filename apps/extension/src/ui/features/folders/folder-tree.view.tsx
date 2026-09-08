import { useId, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
  Edit02Icon,
  LockKeyholeIcon,
  Move01Icon,
  Settings01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/ui/components/primitives/button";
import { Input } from "@/ui/components/primitives/input";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/ui/components/primitives/radio-group";
import {
  flattenFolderTree,
  getFolderIcon,
  type FolderChoice,
  type ManagedFolder,
  type UncategorizedFolder,
} from "./folder-presentation";

export type FolderTreeEditing = {
  readonly folderId: string;
  readonly value: string;
  readonly error?: string;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
};

export type FolderTreeActions = {
  readonly onRename: (folder: ManagedFolder) => void;
  readonly onEdit: (folder: ManagedFolder) => void;
  readonly onAddChild: (folder: ManagedFolder) => void;
  readonly onMove: (folder: ManagedFolder) => void;
  readonly onDelete: (folder: ManagedFolder) => void;
};

function FolderCount({ count }: { count: number }) {
  return (
    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
      {count === 1 ? "1 entry" : `${count} entries`}
    </span>
  );
}

export function FolderTree({
  folders,
  uncategorized,
  selectedId,
  disabled = false,
  editing,
  actions,
  onSelect,
  footer,
}: {
  folders: readonly ManagedFolder[];
  uncategorized?: UncategorizedFolder;
  selectedId?: string;
  disabled?: boolean;
  editing?: FolderTreeEditing;
  actions?: FolderTreeActions;
  onSelect?: (folderId: string) => void;
  footer?: ReactNode;
}) {
  const selectionId = useId();
  const nodes = flattenFolderTree(folders);
  const tree = (
    <div className="overflow-hidden rounded-lg border bg-card">
      <ul aria-label="Folders" className="divide-y">
        {nodes.length === 0 ? (
          <li className="px-3 py-4 text-sm text-muted-foreground">
            No folders yet
          </li>
        ) : null}
        {nodes.map(({ folder, depth }) => {
          const unavailable = folder.entryCount > 0 || folder.childCount > 0;
          const reasonId = `${selectionId}-delete-reason-${folder.id}`;
          const selectionLabelId = `${selectionId}-folder-${folder.id}`;
          return (
            <li key={folder.id}>
              <div
                className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2.5"
                style={{ paddingInlineStart: `${12 + (depth - 1) * 24}px` }}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <HugeiconsIcon
                    icon={getFolderIcon(folder.icon)}
                    size={17}
                    aria-hidden="true"
                  />
                </span>
                {editing?.folderId === folder.id ? (
                  <div className="min-w-48 flex-1">
                    <Input
                      autoFocus
                      value={editing.value}
                      aria-label="Folder name"
                      aria-invalid={!!editing.error}
                      aria-describedby={editing.error ? reasonId : undefined}
                      disabled={disabled}
                      onChange={(event) => editing.onChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          editing.onSave();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          editing.onCancel();
                        }
                      }}
                    />
                    {editing.error ? (
                      <p
                        id={reasonId}
                        role="alert"
                        className="mt-1 text-xs text-destructive"
                      >
                        {editing.error}
                      </p>
                    ) : null}
                  </div>
                ) : onSelect ? (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 has-data-checked:bg-accent">
                    <RadioGroupItem
                      value={folder.id}
                      disabled={disabled}
                      aria-labelledby={selectionLabelId}
                    />
                    <span
                      id={selectionLabelId}
                      className="break-words text-left text-sm font-medium"
                    >
                      {folder.name}
                    </span>
                  </label>
                ) : (
                  <span className="min-w-20 flex-1 break-words text-sm font-medium">
                    {folder.name}
                  </span>
                )}
                <FolderCount count={folder.entryCount} />
                {editing?.folderId === folder.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon-lg"
                      aria-label={`Save ${folder.name}`}
                      disabled={disabled}
                      onClick={editing.onSave}
                    >
                      <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-lg"
                      variant="ghost"
                      aria-label={`Cancel renaming ${folder.name}`}
                      disabled={disabled}
                      onClick={editing.onCancel}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
                    </Button>
                  </div>
                ) : actions ? (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon-lg"
                      variant="ghost"
                      aria-label={`Add subfolder to ${folder.name}`}
                      title={`Add subfolder to ${folder.name}`}
                      disabled={disabled}
                      onClick={() => actions.onAddChild(folder)}
                    >
                      <HugeiconsIcon icon={Add01Icon} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-lg"
                      variant="ghost"
                      aria-label={`Rename ${folder.name}`}
                      title={`Rename ${folder.name}`}
                      disabled={disabled}
                      onClick={() => actions.onRename(folder)}
                    >
                      <HugeiconsIcon icon={Edit02Icon} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-lg"
                      variant="ghost"
                      aria-label={`Edit ${folder.name}`}
                      title={`Edit ${folder.name}`}
                      disabled={disabled}
                      onClick={() => actions.onEdit(folder)}
                    >
                      <HugeiconsIcon icon={Settings01Icon} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-lg"
                      variant="ghost"
                      aria-label={`Move ${folder.name}`}
                      title={`Move ${folder.name}`}
                      disabled={disabled}
                      onClick={() => actions.onMove(folder)}
                    >
                      <HugeiconsIcon icon={Move01Icon} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-lg"
                      variant="ghost"
                      aria-label={`Delete ${folder.name}`}
                      title={
                        unavailable
                          ? "Folder is not empty"
                          : `Delete ${folder.name}`
                      }
                      aria-describedby={unavailable ? reasonId : undefined}
                      disabled={disabled || unavailable}
                      onClick={() => actions.onDelete(folder)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>
              {actions && unavailable ? (
                <p
                  id={reasonId}
                  className="px-3 pb-2 text-xs text-muted-foreground"
                  style={{ paddingInlineStart: `${52 + (depth - 1) * 24}px` }}
                >
                  Move its entries and subfolders before deleting it.
                </p>
              ) : null}
            </li>
          );
        })}
        {uncategorized ? (
          <li>
            <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <HugeiconsIcon
                  icon={LockKeyholeIcon}
                  size={17}
                  aria-hidden="true"
                />
              </span>
              {onSelect ? (
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 has-data-checked:bg-accent">
                  <RadioGroupItem
                    value={uncategorized.id}
                    disabled={disabled}
                    aria-labelledby={`${selectionId}-uncategorized`}
                  />
                  <span
                    id={`${selectionId}-uncategorized`}
                    className="text-sm font-medium"
                  >
                    {uncategorized.name}
                  </span>
                </label>
              ) : (
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {uncategorized.name}
                </span>
              )}
              <FolderCount count={uncategorized.entryCount} />
              <span className="text-xs text-muted-foreground">Locked</span>
            </div>
          </li>
        ) : null}
      </ul>
      {footer ? <div className="border-t p-3">{footer}</div> : null}
    </div>
  );
  if (!onSelect) return tree;
  return (
    <RadioGroup
      value={selectedId}
      disabled={disabled}
      aria-label="Folder"
      onValueChange={(value) => {
        if (typeof value === "string") onSelect(value);
      }}
    >
      {tree}
    </RadioGroup>
  );
}

export function FolderPicker({
  folders,
  uncategorized,
  value,
  disabled = false,
  onChange,
  onCreate,
}: {
  folders: readonly FolderChoice[];
  uncategorized: UncategorizedFolder;
  value: string;
  disabled?: boolean;
  onChange: (folderId: string) => void;
  onCreate?: () => void;
}) {
  const id = useId();
  return (
    <section className="space-y-2" aria-label="Folder">
      <span className="text-sm font-medium">Folder</span>
      <RadioGroup
        value={value}
        disabled={disabled}
        aria-label="Folder"
        className="overflow-hidden rounded-lg border bg-card"
        onValueChange={(folderId) => {
          if (typeof folderId === "string") onChange(folderId);
        }}
      >
        {[
          ...flattenFolderTree(folders),
          { folder: uncategorized, depth: 1 },
        ].map(({ folder, depth }) => {
          const locked = folder.id === uncategorized.id;
          const labelId = `${id}-${folder.id}`;
          return (
            <label
              key={folder.id}
              className="flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 last:border-b-0 has-data-checked:bg-accent"
              style={{ paddingInlineStart: `${12 + (depth - 1) * 24}px` }}
            >
              <RadioGroupItem
                value={folder.id}
                disabled={disabled}
                aria-labelledby={labelId}
              />
              <HugeiconsIcon
                icon={
                  locked
                    ? LockKeyholeIcon
                    : getFolderIcon("icon" in folder ? folder.icon : "folder")
                }
                size={17}
                className="text-muted-foreground"
                aria-hidden="true"
              />
              <span id={labelId} className="min-w-0 flex-1 text-sm font-medium">
                {folder.name}
              </span>
              <FolderCount count={folder.entryCount} />
            </label>
          );
        })}
        {onCreate ? (
          <div className="border-t p-3">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={onCreate}
            >
              <HugeiconsIcon icon={Add01Icon} aria-hidden="true" />
              New folder
            </Button>
          </div>
        ) : null}
      </RadioGroup>
    </section>
  );
}
