import { tagSchema } from "../../domain/entry/tag.schema";
import type {
  TagColor,
  TagGroupId,
  TagId,
  TagShade,
} from "../../domain/entry/tag.type";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import { addTagToVault } from "../../domain/vault/vault-tag.mutations";
import { requireUniqueVaultTagName } from "../../domain/vault/vault-tag-name.policy";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import { InvalidVaultTagError } from "../../errors/vault-tag.errors";
import type { IdPort } from "../../ports/system/id.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VaultMutationService } from "../../services/vault/vault-mutation.service";
import { requireVaultTagGroupExists } from "../../domain/vault/vault-organization-reference.policy";
import { VAULT_TAG_SOFT_LIMIT } from "../../domain/entry/tag.const";

export type AddTagCommandParams = {
  readonly vaultId: string;
  readonly tag: {
    readonly name: string;
    readonly groupId: TagGroupId;
    readonly color: TagColor;
    readonly shade: TagShade;
  };
};

export type AddTagResult = {
  readonly tagId: TagId;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
  readonly syncUpload: SyncUploadStatus;
  readonly syncConfigured: boolean;
  readonly softLimitReached: boolean;
};

export class AddTagUseCase {
  private readonly ids: IdPort;
  private readonly clock: ClockPort;
  private readonly mutation: VaultMutationService;

  constructor(ids: IdPort, clock: ClockPort, mutation: VaultMutationService) {
    this.ids = ids;
    this.clock = clock;
    this.mutation = mutation;
  }

  async execute(params: AddTagCommandParams): Promise<AddTagResult> {
    const input = tagSchema
      .omit({ id: true, createdAt: true })
      .safeParse(params.tag);
    if (!input.success) throw new InvalidVaultTagError(input.error);
    let tagId: TagId | undefined;
    let softLimitReached = false;
    const receipt = await this.mutation.persist(
      params.vaultId,
      "add tag",
      async (vault, deviceId) => {
        requireUniqueVaultTagName(vault, input.data.name);
        requireVaultTagGroupExists(vault, input.data.groupId);
        tagId = await this.ids.generateId();
        const parsed = tagSchema.safeParse({
          id: tagId,
          ...input.data,
          createdAt: this.clock.now(),
        });
        if (!parsed.success) throw new InvalidVaultTagError(parsed.error);
        const updated = addTagToVault(vault, parsed.data, deviceId);
        softLimitReached = updated.tags.length >= VAULT_TAG_SOFT_LIMIT;
        return updated;
      },
    );
    if (tagId === undefined) throw new Error("Tag ID was not generated.");
    return { tagId, softLimitReached, ...receipt };
  }
}
