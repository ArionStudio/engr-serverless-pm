import { resolveSuggestedFolderParent } from "@lfspm/core";
import { useCallback, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/ui/components/primitives/button";
import { Spinner } from "@/ui/components/primitives/spinner";
import { DestructiveConfirmation } from "@/ui/components/feedback/destructive-confirmation.view";
import type { FolderManagementCapabilities } from "./folder-management.type";
import { FolderEditor, type FolderDraft } from "./folder-editor.view";
import { folderDepth, type ManagedFolder } from "./folder-presentation";
import { FolderTree, type FolderTreeEditing } from "./folder-tree.view";
import { MoveFolderDialog } from "./move-folder-dialog.view";
import { useFolderManagement } from "./use-folder-management";

type EditorState = {
  readonly parentId: string | null;
  readonly folder?: ManagedFolder;
};

type RenameState = {
  readonly folder: ManagedFolder;
  readonly value: string;
  readonly error?: string;
};

type FolderManagementViewProps = {
  vaultId: string;
  capabilities: FolderManagementCapabilities;
  onSessionLost?: () => void;
};

export function FolderManagementView(props: FolderManagementViewProps) {
  return <FolderManagementContent key={props.vaultId} {...props} />;
}

function FolderManagementContent({
  vaultId,
  capabilities,
  onSessionLost,
}: FolderManagementViewProps) {
  const [editor, setEditor] = useState<EditorState>();
  const [renaming, setRenaming] = useState<RenameState>();
  const [moving, setMoving] = useState<ManagedFolder>();
  const [removing, setRemoving] = useState<ManagedFolder>();
  const clearAuthorizationState = useCallback(() => {
    setEditor(undefined);
    setRenaming(undefined);
    setMoving(undefined);
    setRemoving(undefined);
    onSessionLost?.();
  }, [onSessionLost]);
  const live = useFolderManagement(
    vaultId,
    capabilities,
    clearAuthorizationState,
  );

  const beginAdd = (parentId: string | null) => {
    live.clearMutationError();
    setRenaming(undefined);
    setEditor({ parentId });
  };
  const beginRename = (folder: ManagedFolder) => {
    live.clearMutationError();
    setEditor(undefined);
    setRenaming({ folder, value: folder.name });
  };
  const beginEdit = (folder: ManagedFolder) => {
    live.clearMutationError();
    setRenaming(undefined);
    setEditor({ parentId: folder.parentId, folder });
  };
  const beginMove = (folder: ManagedFolder) => {
    live.clearMutationError();
    setMoving(folder);
  };
  const beginRemove = (folder: ManagedFolder) => {
    if (folder.entryCount > 0 || folder.childCount > 0) return;
    live.clearMutationError();
    setRemoving(folder);
  };

  const saveRename = () => {
    if (!renaming) return;
    const name = renaming.value.trim();
    if (!name) {
      setRenaming({ ...renaming, error: "Enter a folder name." });
      return;
    }
    void live
      .update({
        vaultId,
        folderId: renaming.folder.id,
        expectedFolderVersionVector: renaming.folder.versionVector,
        folder: {
          name,
          icon: renaming.folder.icon,
          description: renaming.folder.description,
        },
      })
      .then((saved) => {
        if (saved) setRenaming(undefined);
      });
  };

  const treeEditing: FolderTreeEditing | undefined = renaming
    ? {
        folderId: renaming.folder.id,
        value: renaming.value,
        error: renaming.error ?? live.mutationError,
        onChange: (value) => setRenaming({ folder: renaming.folder, value }),
        onSave: saveRename,
        onCancel: () => {
          live.clearMutationError();
          setRenaming(undefined);
        },
      }
    : undefined;

  const parent = editor?.parentId
    ? live.folders.find((folder) => folder.id === editor.parentId)
    : undefined;

  return (
    <section className="max-w-4xl space-y-6" aria-label="Folder management">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Folders</h1>
        {!editor ? (
          <Button onClick={() => beginAdd(null)} disabled={live.pending}>
            <HugeiconsIcon icon={Add01Icon} size={17} aria-hidden="true" />
            New folder
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

      {live.mutationError && !editor && !renaming && !moving && !removing ? (
        <p role="alert" className="text-sm text-destructive">
          {live.mutationError}
        </p>
      ) : null}

      {live.feedback ? (
        <p role="status" className="text-sm text-muted-foreground">
          {live.feedback}
        </p>
      ) : null}

      {editor ? (
        <FolderEditor
          key={editor.folder?.id ?? "new-folder"}
          mode={editor.folder ? "edit" : "add"}
          suggestions={live.library?.folders}
          onSuggestionSelected={(suggestion) => {
            if (suggestion.parent === null)
              setEditor({ ...editor, parentId: null });
            else {
              const suggestedParentId = resolveSuggestedFolderParent(
                live.folders,
                suggestion.parent,
              );
              if (suggestedParentId)
                setEditor({ ...editor, parentId: suggestedParentId });
            }
          }}
          initial={
            editor.folder
              ? {
                  name: editor.folder.name,
                  icon: editor.folder.icon,
                  description: editor.folder.description,
                }
              : undefined
          }
          parentName={parent?.name}
          deepNesting={folderDepth(editor.parentId, live.folders) + 1 > 2}
          pending={live.pending}
          error={live.mutationError}
          onCancel={() => {
            live.clearMutationError();
            setEditor(undefined);
          }}
          onSubmit={(folder: FolderDraft) => {
            void (
              editor.folder
                ? live.update({
                    vaultId,
                    folderId: editor.folder.id,
                    expectedFolderVersionVector: editor.folder.versionVector,
                    folder,
                  })
                : live.add({
                    vaultId,
                    folder: { ...folder, parentId: editor.parentId },
                  })
            ).then((saved) => {
              if (saved) setEditor(undefined);
            });
          }}
        />
      ) : live.loading && !live.hasData ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Spinner /> Loading folders…
        </p>
      ) : live.readError && !live.hasData ? null : live.uncategorized ? (
        <FolderTree
          folders={live.folders}
          uncategorized={live.uncategorized}
          disabled={live.pending}
          editing={treeEditing}
          actions={{
            onAddChild: (folder) => beginAdd(folder.id),
            onRename: beginRename,
            onEdit: beginEdit,
            onMove: beginMove,
            onDelete: beginRemove,
          }}
          footer={
            live.folders.length === 0 ? (
              <Button variant="outline" onClick={() => beginAdd(null)}>
                <HugeiconsIcon icon={Add01Icon} size={17} aria-hidden="true" />
                Create your first folder
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {moving ? (
        <MoveFolderDialog
          key={moving.id}
          folder={moving}
          folders={live.folders}
          pending={live.pending}
          error={live.mutationError}
          onOpenChange={(open) => {
            if (!open && !live.pending) {
              live.clearMutationError();
              setMoving(undefined);
            }
          }}
          onMove={(parentId) => {
            void live
              .move({
                vaultId,
                folderId: moving.id,
                expectedFolderVersionVector: moving.versionVector,
                parentId,
              })
              .then((saved) => {
                if (saved) setMoving(undefined);
              });
          }}
        />
      ) : null}

      {removing ? (
        <DestructiveConfirmation
          open
          action="Delete folder"
          identity={removing.name}
          consequences="This removes the empty folder from this vault."
          pending={live.pending}
          error={live.mutationError}
          onOpenChange={(open) => {
            if (!open) {
              live.clearMutationError();
              setRemoving(undefined);
            }
          }}
          onConfirm={() => {
            if (removing.entryCount > 0 || removing.childCount > 0) return;
            void live
              .remove({
                vaultId,
                folderId: removing.id,
                expectedFolderVersionVector: removing.versionVector,
              })
              .then((saved) => {
                if (saved) setRemoving(undefined);
              });
          }}
        />
      ) : null}
    </section>
  );
}
