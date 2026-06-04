import type { SyncConfig } from "../../domain/sync/sync-config.type";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import { InvalidSyncConfigError } from "../__errors/sync.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { CommitUnlockedVaultSessionService } from "../../application/vault-session/commit-unlocked-vault-session.service";
import type { GetUnlockedVaultSessionService } from "../../application/vault-session/get-unlocked-vault-session.service";
import type { PersistUnlockedVaultService } from "../../application/vault-snapshots/persist-unlocked-vault.service";

export type SetupSyncCommandParams = {
  readonly vaultId: string;
  readonly syncConfig: SyncConfig;
};

export class SetupSyncUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly getUnlockedVaultSession: GetUnlockedVaultSessionService;
  private readonly persistUnlockedVault: PersistUnlockedVaultService;
  private readonly commitUnlockedVaultSession: CommitUnlockedVaultSessionService;

  constructor(
    syncProvider: SyncProviderPort,
    getUnlockedVaultSession: GetUnlockedVaultSessionService,
    persistUnlockedVault: PersistUnlockedVaultService,
    commitUnlockedVaultSession: CommitUnlockedVaultSessionService,
  ) {
    this.syncProvider = syncProvider;
    this.getUnlockedVaultSession = getUnlockedVaultSession;
    this.persistUnlockedVault = persistUnlockedVault;
    this.commitUnlockedVaultSession = commitUnlockedVaultSession;
  }

  async execute(params: SetupSyncCommandParams): Promise<void> {
    const unlockedVaultSession = await this.getUnlockedVaultSession.get();
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

    const persistedSnapshot = await this.persistUnlockedVault.persist(
      params.vaultId,
      updatedUnlockedVault,
    );

    await this.commitUnlockedVaultSession.commit(
      updatedUnlockedVault,
      persistedSnapshot.revision,
    );
  }
}
