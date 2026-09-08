import type {
  AddFolderCommandParams,
  MoveFolderCommandParams,
  ReadFoldersResult,
  RemoveFolderCommandParams,
  UpdateFolderCommandParams,
} from "@lfspm/core";
import type { FolderManagementCapabilities } from "@/ui/features/folders";
import { globalLibrarySchema } from "@lfspm/core";
import organizationLibrary from "@/assets/data/global-library.json";

export function galleryFolderManagement(
  retryRead = false,
): FolderManagementCapabilities {
  let revision = 2;
  let folders: ReadFoldersResult["folders"] = [
    {
      id: "folder-work",
      name: "Work",
      icon: "briefcase",
      description: "Professional accounts",
      parentId: null,
      createdAt: 1,
      versionVector: { gallery: 1 },
      entryCount: 1,
      childCount: 1,
    },
    {
      id: "folder-dev",
      name: "Dev",
      icon: "code",
      description: "Development tools",
      parentId: "folder-work",
      createdAt: 2,
      versionVector: { gallery: 1 },
      entryCount: 0,
      childCount: 0,
    },
  ];
  let readFailed = false;
  const read = async (): Promise<ReadFoldersResult> => {
    if (retryRead && !readFailed) {
      readFailed = true;
      throw new Error("Temporary read failure");
    }
    return {
      folders,
      uncategorized: {
        id: "uncategorized",
        name: "Uncategorized",
        entryCount: 0,
      },
    };
  };
  return {
    read,
    readOrganizationLibrary: async () =>
      globalLibrarySchema.parse(organizationLibrary),
    add: async ({ folder }: AddFolderCommandParams) => {
      const folderId = `folder-${++revision}`;
      folders = [
        ...folders,
        {
          ...folder,
          id: folderId,
          createdAt: revision,
          versionVector: { gallery: revision },
          entryCount: 0,
          childCount: 0,
        },
      ];
      return {
        folderId,
        snapshotVersionVector: { gallery: revision },
        revisionTimestamp: revision,
        syncConfigured: true,
        syncUpload: "complete",
      };
    },
    update: async ({ folderId, folder }: UpdateFolderCommandParams) => {
      folders = folders.map((current) =>
        current.id === folderId
          ? {
              ...current,
              ...folder,
              versionVector: { gallery: ++revision },
            }
          : current,
      );
      return {
        folderId,
        snapshotVersionVector: { gallery: revision },
        revisionTimestamp: revision,
        syncConfigured: true,
        syncUpload: "complete",
      };
    },
    move: async ({ folderId, parentId }: MoveFolderCommandParams) => {
      folders = folders.map((current) =>
        current.id === folderId
          ? {
              ...current,
              parentId,
              versionVector: { gallery: ++revision },
            }
          : current,
      );
      return {
        folderId,
        snapshotVersionVector: { gallery: revision },
        revisionTimestamp: revision,
        syncConfigured: true,
        syncUpload: "complete",
      };
    },
    remove: async ({ folderId }: RemoveFolderCommandParams) => {
      folders = folders.filter(({ id }) => id !== folderId);
      return {
        folderId,
        snapshotVersionVector: { gallery: ++revision },
        revisionTimestamp: revision,
        syncConfigured: true,
        syncUpload: "complete",
      };
    },
    subscribe: () => () => {},
  };
}
