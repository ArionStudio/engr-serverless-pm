import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import { PasswordEntryNotFoundError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { PersistUnlockedVaultUseCase } from "../vault-snapshots/persist-unlocked-vault";
import { saveUnlockedVaultOrCleanup } from "../vault-snapshots/save-unlocked-vault-or-cleanup";

export type RemoveEntryCommandParams = {
  vaultId: string;
  entryId: string;
};

export type RemoveEntryResult = {
  entryId: string;
  revision: number;
  revisionTimestamp: number;
  deviceId: string;
};

export class RemoveEntryUseCase {
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;
  private readonly persistUnlockedVault: PersistUnlockedVaultUseCase;

  constructor(
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
    persistUnlockedVault: PersistUnlockedVaultUseCase,
  ) {
    this.unlockedVaultRepository = unlockedVaultRepository;
    this.persistUnlockedVault = persistUnlockedVault;
  }

  async execute(params: RemoveEntryCommandParams): Promise<RemoveEntryResult> {
    const unlockedVault = await this.unlockedVaultRepository.getUnlockedVault();

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "remove entry");
    }

    const entryExists = unlockedVault.vault.entries.some(
      (entry) => entry.id === params.entryId,
    );

    if (!entryExists) {
      throw new PasswordEntryNotFoundError(params.vaultId, params.entryId);
    }

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        entries: unlockedVault.vault.entries.filter(
          (entry) => entry.id !== params.entryId,
        ),
      },
    };

    const persistedSnapshot = await this.persistUnlockedVault.execute({
      vaultId: params.vaultId,
      unlockedVault: updatedUnlockedVault,
    });

    await saveUnlockedVaultOrCleanup(
      this.unlockedVaultRepository,
      updatedUnlockedVault,
    );

    return {
      entryId: params.entryId,
      ...persistedSnapshot,
    };
  }
}
