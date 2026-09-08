import type {
  TagColor,
  TagGroupId,
  TagId,
  TagShade,
} from "../../domain/entry/tag.type";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { VAULT_TAG_SOFT_LIMIT } from "../../domain/entry/tag.const";

export type ReadTagsResult = {
  readonly tags: readonly {
    readonly id: TagId;
    readonly name: string;
    readonly groupId: TagGroupId;
    readonly color: TagColor;
    readonly shade: TagShade;
    readonly createdAt: number;
    readonly versionVector: Readonly<VersionVector>;
    readonly entryCount: number;
  }[];
  readonly softLimit: typeof VAULT_TAG_SOFT_LIMIT;
  readonly softLimitReached: boolean;
};

export class ReadTagsUseCase {
  private readonly session: UnlockedVaultSessionService;

  constructor(session: UnlockedVaultSessionService) {
    this.session = session;
  }

  async execute({ vaultId }: { vaultId: string }): Promise<ReadTagsResult> {
    return this.session.runWithUnlockedVaultContext(
      vaultId,
      "read tags",
      ({ unlockedVault }) =>
        Promise.resolve({
          tags: unlockedVault.vault.tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            groupId: tag.groupId,
            color: tag.color,
            shade: tag.shade,
            createdAt: tag.createdAt,
            versionVector: { ...tag.versionVector },
            entryCount: unlockedVault.vault.entries.filter((entry) =>
              entry.tags.includes(tag.id),
            ).length,
          })),
          softLimit: VAULT_TAG_SOFT_LIMIT,
          softLimitReached:
            unlockedVault.vault.tags.length >= VAULT_TAG_SOFT_LIMIT,
        }),
    );
  }
}
