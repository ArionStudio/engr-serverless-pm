import type { SyncConfig } from "../../domain/sync/sync-config.type";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { UnlockedVaultRepositoryPort } from "../../ports/vault/unlocked-vault-repository.port";
import { InvalidSyncConfigError } from "../__errors/sync.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { CommitUnlockedVaultSessionUseCase } from "../vault-session/commit-unlocked-vault-session";
import type { PersistUnlockedVaultUseCase } from "../vault-snapshots/persist-unlocked-vault";

export type SetupSyncCommandParams = {
  readonly vaultId: string;
  readonly syncConfig: SyncConfig;
};

export class SetupSyncUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;
  private readonly persistUnlockedVault: PersistUnlockedVaultUseCase;
  private readonly commitUnlockedVaultSession: CommitUnlockedVaultSessionUseCase;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
    persistUnlockedVault: PersistUnlockedVaultUseCase,
    commitUnlockedVaultSession: CommitUnlockedVaultSessionUseCase,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultRepository = unlockedVaultRepository;
    this.persistUnlockedVault = persistUnlockedVault;
    this.commitUnlockedVaultSession = commitUnlockedVaultSession;
  }

  async execute(params: SetupSyncCommandParams): Promise<void> {
    const unlockedVaultSession =
      await this.unlockedVaultRepository.getUnlockedVaultSession();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "setup sync");
    }

    let syncConfig: SyncConfig;

    try {
      syncConfig = await this.syncProvider.setup(params.syncConfig);
    } catch (error) {
      throw new InvalidSyncConfigError(error);
    }

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        syncConfig,
      },
    };

    const persistedSnapshot = await this.persistUnlockedVault.execute({
      vaultId: params.vaultId,
      unlockedVault: updatedUnlockedVault,
    });

    await this.commitUnlockedVaultSession.execute({
      unlockedVault: updatedUnlockedVault,
      sourceSnapshotRevision: persistedSnapshot.revision,
    });
  }
}
