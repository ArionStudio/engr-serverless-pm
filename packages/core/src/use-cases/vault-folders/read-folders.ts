import { UNCATEGORIZED_FOLDER_ID } from "../../domain/organization/folder.schema";
import type { VisibleFolderFields } from "../../domain/organization/folder.type";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export type ReadFoldersResult = {
  readonly folders: readonly (VisibleFolderFields & {
    readonly versionVector: Readonly<VersionVector>;
    readonly entryCount: number;
    readonly childCount: number;
  })[];
  readonly uncategorized: {
    readonly id: typeof UNCATEGORIZED_FOLDER_ID;
    readonly name: "Uncategorized";
    readonly entryCount: number;
  };
};
export class ReadFoldersUseCase {
  private readonly session: UnlockedVaultSessionService;

  constructor(session: UnlockedVaultSessionService) {
    this.session = session;
  }
  async execute({
    vaultId,
  }: {
    readonly vaultId: string;
  }): Promise<ReadFoldersResult> {
    return this.session.runWithUnlockedVaultContext(
      vaultId,
      "read folders",
      ({ unlockedVault }) =>
        Promise.resolve({
          folders: unlockedVault.vault.folders.map((folder) => ({
            ...folder,
            versionVector: { ...folder.versionVector },
            entryCount: unlockedVault.vault.entries.filter(
              (entry) => entry.folderId === folder.id,
            ).length,
            childCount: unlockedVault.vault.folders.filter(
              (candidate) => candidate.parentId === folder.id,
            ).length,
          })),
          uncategorized: {
            id: UNCATEGORIZED_FOLDER_ID,
            name: "Uncategorized",
            entryCount: unlockedVault.vault.entries.filter(
              (entry) => entry.folderId === UNCATEGORIZED_FOLDER_ID,
            ).length,
          },
        }),
    );
  }
}
