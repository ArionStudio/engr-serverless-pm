import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { SyncTarget } from "../../domain/sync/sync-config.type";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export type GetSyncConfigurationResult = {
  readonly target: SyncTarget | null;
  readonly snapshotVersionVector: VersionVector;
  readonly providerCredentialRevocationPending: boolean;
  readonly syncRemovalPending: boolean;
};

export class GetSyncConfigurationUseCase {
  private readonly session: UnlockedVaultSessionService;
  constructor(session: UnlockedVaultSessionService) {
    this.session = session;
  }

  async execute(params: {
    readonly vaultId: string;
  }): Promise<GetSyncConfigurationResult> {
    const { unlockedVault, sourceSnapshotVersionVector } =
      await this.session.requireUnlockedVaultContext(
        params.vaultId,
        "read sync configuration",
      );
    const target = unlockedVault.vault.syncTarget;
    return {
      snapshotVersionVector: { ...sourceSnapshotVersionVector },
      providerCredentialRevocationPending:
        unlockedVault.vault.providerCredentialRevocationPending !== undefined,
      syncRemovalPending: unlockedVault.vault.syncRemovalPending !== undefined,
      target:
        target === undefined
          ? null
          : (JSON.parse(JSON.stringify(target)) as SyncTarget),
    };
  }
}
