import { folderIdSchema } from "../../domain/organization/folder.schema";
import {
  captureExpectedFolderVersion,
  requireExpectedFolderVersion,
} from "../../domain/organization/folder-version.policy";
import type { FolderId } from "../../domain/organization/folder.type";
import { moveFolderInVault } from "../../domain/vault/vault-folder.mutations";
import {
  InvalidVaultFolderError,
  VaultFolderNotFoundError,
} from "../../errors/vault-organization.errors";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { VaultMutationService } from "../../services/vault/vault-mutation.service";
import type { VaultMutationResult } from "../../services/vault/vault-mutation.type";

export type MoveFolderCommandParams = {
  readonly vaultId: string;
  readonly folderId: FolderId;
  readonly expectedFolderVersionVector: Readonly<VersionVector>;
  readonly parentId: FolderId | null;
};
export type MoveFolderResult = VaultMutationResult & {
  readonly folderId: FolderId;
};

export class MoveFolderUseCase {
  private readonly mutation: VaultMutationService;

  constructor(mutation: VaultMutationService) {
    this.mutation = mutation;
  }
  async execute(params: MoveFolderCommandParams): Promise<MoveFolderResult> {
    const parsed = folderIdSchema.nullable().safeParse(params.parentId);
    if (!parsed.success) throw new InvalidVaultFolderError(parsed.error);
    const expected = captureExpectedFolderVersion(
      params.expectedFolderVersionVector,
    );
    const result = await this.mutation.persist(
      params.vaultId,
      "move folder",
      (vault, deviceId) => {
        const current = vault.folders.find(
          (folder) => folder.id === params.folderId,
        );
        if (current === undefined)
          throw new VaultFolderNotFoundError(params.folderId);
        requireExpectedFolderVersion(current.versionVector, expected);

        return moveFolderInVault(vault, params.folderId, parsed.data, deviceId);
      },
    );
    return { folderId: params.folderId, ...result };
  }
}
