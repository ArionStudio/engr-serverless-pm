import type { UnlockedVaultRepositoryPort } from "../../ports/vault/unlocked-vault-repository.port";
import { PasswordEntryNotFoundError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { CommitUnlockedVaultSessionUseCase } from "../vault-session/commit-unlocked-vault-session";
import type { PersistUnlockedVaultUseCase } from "../vault-snapshots/persist-unlocked-vault";

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
  private readonly commitUnlockedVaultSession: CommitUnlockedVaultSessionUseCase;

  constructor(
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
    persistUnlockedVault: PersistUnlockedVaultUseCase,
    commitUnlockedVaultSession: CommitUnlockedVaultSessionUseCase,
  ) {
    this.unlockedVaultRepository = unlockedVaultRepository;
    this.persistUnlockedVault = persistUnlockedVault;
    this.commitUnlockedVaultSession = commitUnlockedVaultSession;
  }

  async execute(params: RemoveEntryCommandParams): Promise<RemoveEntryResult> {
    const unlockedVaultSession =
      await this.unlockedVaultRepository.getUnlockedVaultSession();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

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

    await this.commitUnlockedVaultSession.execute({
      unlockedVault: updatedUnlockedVault,
      sourceSnapshotRevision: persistedSnapshot.revision,
    });

    return {
      entryId: params.entryId,
      ...persistedSnapshot,
    };
  }
}
