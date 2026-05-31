import type { SyncConfig } from "../../domain/sync/sync-config.type";
import type { SyncProviderPort } from "../../ports/sync-provider.port";
import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import { InvalidSyncConfigError } from "../__errors/sync.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { PersistUnlockedVaultUseCase } from "../vault-snapshots/persist-unlocked-vault";

export type SetupSyncCommandParams = {
  readonly vaultId: string;
  readonly syncConfig: SyncConfig;
};

export class SetupSyncUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;
  private readonly persistUnlockedVault: PersistUnlockedVaultUseCase;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
    persistUnlockedVault: PersistUnlockedVaultUseCase,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultRepository = unlockedVaultRepository;
    this.persistUnlockedVault = persistUnlockedVault;
  }

  async execute(params: SetupSyncCommandParams): Promise<void> {
    const unlockedVault = await this.unlockedVaultRepository.getUnlockedVault();

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

    await this.persistUnlockedVault.execute({
      vaultId: params.vaultId,
      unlockedVault: updatedUnlockedVault,
    });

    try {
      await this.unlockedVaultRepository.saveUnlockedVault(
        updatedUnlockedVault,
      );
    } catch (error) {
      try {
        await this.unlockedVaultRepository.removeUnlockedVault();
      } catch {
        // Preserve the session save failure as the root cause.
      }
      throw error;
    }
  }
}
