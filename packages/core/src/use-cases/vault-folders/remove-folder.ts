import {
  captureExpectedFolderVersion,
  requireExpectedFolderVersion,
} from "../../domain/organization/folder-version.policy";
import type { FolderId } from "../../domain/organization/folder.type";
import { removeFolderFromVault } from "../../domain/vault/vault-folder.mutations";
import { VaultFolderNotFoundError } from "../../errors/vault-organization.errors";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VaultMutationService } from "../../services/vault/vault-mutation.service";
import type { VaultMutationResult } from "../../services/vault/vault-mutation.type";

export type RemoveFolderCommandParams = {
  readonly vaultId: string;
  readonly folderId: FolderId;
  readonly expectedFolderVersionVector: Readonly<VersionVector>;
};
export type RemoveFolderResult = VaultMutationResult & {
  readonly folderId: FolderId;
};

export class RemoveFolderUseCase {
  private readonly clock: ClockPort;
  private readonly mutation: VaultMutationService;

  constructor(clock: ClockPort, mutation: VaultMutationService) {
    this.clock = clock;
    this.mutation = mutation;
  }
  async execute(
    params: RemoveFolderCommandParams,
  ): Promise<RemoveFolderResult> {
    const expected = captureExpectedFolderVersion(
      params.expectedFolderVersionVector,
    );
    const result = await this.mutation.persist(
      params.vaultId,
      "remove folder",
      (vault, deviceId) => {
        const current = vault.folders.find(
          (folder) => folder.id === params.folderId,
        );
        if (current === undefined)
          throw new VaultFolderNotFoundError(params.folderId);
        requireExpectedFolderVersion(current.versionVector, expected);
        return removeFolderFromVault(
          vault,
          params.folderId,
          deviceId,
          this.clock.now(),
        );
      },
    );
    return { folderId: params.folderId, ...result };
  }
}
