import {
  captureExpectedTagVersion,
  requireExpectedTagVersion,
} from "../../domain/entry/tag-version.policy";
import type { TagId } from "../../domain/entry/tag.type";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import { removeTagFromVault } from "../../domain/vault/vault-tag.mutations";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import { VaultTagNotFoundError } from "../../errors/vault-tag.errors";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VaultMutationService } from "../../services/vault/vault-mutation.service";

export type RemoveTagCommandParams = {
  readonly vaultId: string;
  readonly tagId: TagId;
  readonly expectedTagVersionVector: Readonly<VersionVector>;
};

export type RemoveTagResult = {
  readonly tagId: TagId;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
  readonly syncUpload: SyncUploadStatus;
  readonly syncConfigured: boolean;
};

export class RemoveTagUseCase {
  private readonly clock: ClockPort;
  private readonly mutation: VaultMutationService;

  constructor(clock: ClockPort, mutation: VaultMutationService) {
    this.clock = clock;
    this.mutation = mutation;
  }

  async execute(params: RemoveTagCommandParams): Promise<RemoveTagResult> {
    const expectedVersion = captureExpectedTagVersion(
      params.expectedTagVersionVector,
    );
    const receipt = await this.mutation.persist(
      params.vaultId,
      "remove tag",
      (vault, deviceId) => {
        const current = vault.tags.find((tag) => tag.id === params.tagId);
        if (current === undefined)
          throw new VaultTagNotFoundError(params.tagId);
        requireExpectedTagVersion(current.versionVector, expectedVersion);
        return removeTagFromVault(
          vault,
          params.tagId,
          deviceId,
          this.clock.now(),
        );
      },
    );
    return { tagId: params.tagId, ...receipt };
  }
}
