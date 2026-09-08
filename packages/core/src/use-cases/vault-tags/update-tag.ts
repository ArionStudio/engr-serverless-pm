import { tagSchema } from "../../domain/entry/tag.schema";
import {
  captureExpectedTagVersion,
  requireExpectedTagVersion,
} from "../../domain/entry/tag-version.policy";
import type {
  TagColor,
  TagGroupId,
  TagId,
  TagShade,
} from "../../domain/entry/tag.type";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import { updateTagInVault } from "../../domain/vault/vault-tag.mutations";
import { requireUniqueVaultTagName } from "../../domain/vault/vault-tag-name.policy";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import {
  InvalidVaultTagError,
  VaultTagNotFoundError,
} from "../../errors/vault-tag.errors";
import type { VaultMutationService } from "../../services/vault/vault-mutation.service";
import { requireVaultTagGroupExists } from "../../domain/vault/vault-organization-reference.policy";

export type UpdateTagCommandParams = {
  readonly vaultId: string;
  readonly tagId: TagId;
  readonly expectedTagVersionVector: Readonly<VersionVector>;
  readonly tag: {
    readonly name: string;
    readonly groupId: TagGroupId;
    readonly color: TagColor;
    readonly shade: TagShade;
  };
};

export type UpdateTagResult = {
  readonly tagId: TagId;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
  readonly syncUpload: SyncUploadStatus;
  readonly syncConfigured: boolean;
};

export class UpdateTagUseCase {
  private readonly mutation: VaultMutationService;

  constructor(mutation: VaultMutationService) {
    this.mutation = mutation;
  }

  async execute(params: UpdateTagCommandParams): Promise<UpdateTagResult> {
    const parsed = tagSchema
      .omit({ id: true, createdAt: true })
      .safeParse(params.tag);
    if (!parsed.success) throw new InvalidVaultTagError(parsed.error);
    const expectedVersion = captureExpectedTagVersion(
      params.expectedTagVersionVector,
    );
    const receipt = await this.mutation.persist(
      params.vaultId,
      "update tag",
      (vault, deviceId) => {
        const current = vault.tags.find((tag) => tag.id === params.tagId);
        if (current === undefined)
          throw new VaultTagNotFoundError(params.tagId);
        requireExpectedTagVersion(current.versionVector, expectedVersion);

        requireUniqueVaultTagName(vault, parsed.data.name, params.tagId);
        requireVaultTagGroupExists(vault, parsed.data.groupId);
        return updateTagInVault(vault, params.tagId, parsed.data, deviceId);
      },
    );
    return { tagId: params.tagId, ...receipt };
  }
}
