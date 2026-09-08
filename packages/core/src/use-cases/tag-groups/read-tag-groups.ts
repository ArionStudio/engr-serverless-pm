import type { VisibleTagGroupFields } from "../../domain/organization/tag-group.type";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export type ReadTagGroupsResult = {
  readonly tagGroups: readonly VisibleTagGroupFields[];
};
export class ReadTagGroupsUseCase {
  private readonly session: UnlockedVaultSessionService;

  constructor(session: UnlockedVaultSessionService) {
    this.session = session;
  }
  async execute({
    vaultId,
  }: {
    readonly vaultId: string;
  }): Promise<ReadTagGroupsResult> {
    return this.session.runWithUnlockedVaultContext(
      vaultId,
      "read tag groups",
      ({ unlockedVault }) =>
        Promise.resolve({
          tagGroups: unlockedVault.vault.tagGroups.map((group) => ({
            ...group,
          })),
        }),
    );
  }
}
