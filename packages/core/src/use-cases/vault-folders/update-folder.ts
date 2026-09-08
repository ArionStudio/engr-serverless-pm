import { folderSchema } from "../../domain/organization/folder.schema";
import {
  captureExpectedFolderVersion,
  requireExpectedFolderVersion,
} from "../../domain/organization/folder-version.policy";
import type { FolderId } from "../../domain/organization/folder.type";
import { updateFolderInVault } from "../../domain/vault/vault-folder.mutations";
import {
  InvalidVaultFolderError,
  VaultFolderNotFoundError,
} from "../../errors/vault-organization.errors";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { VaultMutationService } from "../../services/vault/vault-mutation.service";
import type { VaultMutationResult } from "../../services/vault/vault-mutation.type";

export type UpdateFolderCommandParams = {
  readonly vaultId: string;
  readonly folderId: FolderId;
  readonly expectedFolderVersionVector: Readonly<VersionVector>;
  readonly folder: {
    readonly name: string;
    readonly icon: string;
    readonly description?: string;
  };
};
export type UpdateFolderResult = VaultMutationResult & {
  readonly folderId: FolderId;
};

export class UpdateFolderUseCase {
  private readonly mutation: VaultMutationService;

  constructor(mutation: VaultMutationService) {
    this.mutation = mutation;
  }
  async execute(
    params: UpdateFolderCommandParams,
  ): Promise<UpdateFolderResult> {
    const parsed = folderSchema
      .pick({ name: true, icon: true, description: true })
      .safeParse(params.folder);
    if (!parsed.success) throw new InvalidVaultFolderError(parsed.error);
    const expected = captureExpectedFolderVersion(
      params.expectedFolderVersionVector,
    );
    const result = await this.mutation.persist(
      params.vaultId,
      "update folder",
      (vault, deviceId) => {
        const current = vault.folders.find(
          (folder) => folder.id === params.folderId,
        );
        if (current === undefined)
          throw new VaultFolderNotFoundError(params.folderId);
        requireExpectedFolderVersion(current.versionVector, expected);

        return updateFolderInVault(
          vault,
          params.folderId,
          parsed.data,
          deviceId,
        );
      },
    );
    return { folderId: params.folderId, ...result };
  }
}
