import { useId, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Folder01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/ui/components/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/primitives/dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/ui/components/primitives/radio-group";
import { GuidancePanel } from "@/ui/components/feedback/guidance-panel.view";
import { Spinner } from "@/ui/components/primitives/spinner";
import {
  descendantFolderIds,
  flattenFolderTree,
  folderDepth,
  folderSubtreeHeight,
  getFolderIcon,
  type ManagedFolder,
} from "./folder-presentation";

const ROOT_VALUE = "";

export function MoveFolderDialog({
  folder,
  folders,
  pending = false,
  error,
  onMove,
  onOpenChange,
}: {
  folder: ManagedFolder;
  folders: readonly ManagedFolder[];
  pending?: boolean;
  error?: string;
  onMove: (parentId: string | null) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [destination, setDestination] = useState(folder.parentId ?? ROOT_VALUE);
  const descendants = useMemo(
    () => descendantFolderIds(folder.id, folders),
    [folder.id, folders],
  );
  const choices = flattenFolderTree(folders).filter(
    ({ folder: candidate }) =>
      candidate.id !== folder.id && !descendants.has(candidate.id),
  );
  const parentId = destination === ROOT_VALUE ? null : destination;
  const resultingDepth =
    folderDepth(parentId, folders) + folderSubtreeHeight(folder.id, folders);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(80vh,42rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move {folder.name}</DialogTitle>
          <DialogDescription>
            Choose the folder that will contain this folder.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={destination}
          disabled={pending}
          className="gap-2"
          aria-label="Destination folder"
          onValueChange={(value) => {
            if (typeof value === "string") setDestination(value);
          }}
        >
          <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 has-data-checked:border-primary has-data-checked:bg-accent">
            <RadioGroupItem
              value={ROOT_VALUE}
              disabled={pending}
              aria-labelledby={`${id}-root-label`}
            />
            <HugeiconsIcon icon={Folder01Icon} size={17} aria-hidden="true" />
            <span id={`${id}-root-label`} className="text-sm font-medium">
              Vault root
            </span>
          </label>
          {choices.map(({ folder: candidate, depth }) => {
            const labelId = `${id}-folder-${candidate.id}`;
            return (
              <label
                key={candidate.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border p-3 has-data-checked:border-primary has-data-checked:bg-accent"
                style={{ marginInlineStart: `${(depth - 1) * 20}px` }}
              >
                <RadioGroupItem
                  value={candidate.id}
                  disabled={pending}
                  aria-labelledby={labelId}
                />
                <HugeiconsIcon
                  icon={getFolderIcon(candidate.icon)}
                  size={17}
                  aria-hidden="true"
                />
                <span
                  id={labelId}
                  className="min-w-0 break-words text-sm font-medium"
                >
                  {candidate.name}
                </span>
              </label>
            );
          })}
        </RadioGroup>
        {resultingDepth > 2 ? (
          <GuidancePanel title="Deep folder nesting" variant="warning">
            <p>Folders deeper than two levels may be harder to navigate.</p>
          </GuidancePanel>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || parentId === folder.parentId}
            onClick={() => onMove(parentId)}
          >
            {pending ? <Spinner /> : null}
            Move folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
