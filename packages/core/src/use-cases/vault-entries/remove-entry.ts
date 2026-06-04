import { PasswordEntryNotFoundError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { CommitUnlockedVaultSessionUseCase } from "../vault-session/commit-unlocked-vault-session";
import type { GetUnlockedVaultSessionUseCase } from "../vault-session/get-unlocked-vault-session";
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
  private readonly getUnlockedVaultSession: GetUnlockedVaultSessionUseCase;
  private readonly persistUnlockedVault: PersistUnlockedVaultUseCase;
  private readonly commitUnlockedVaultSession: CommitUnlockedVaultSessionUseCase;

  constructor(
    getUnlockedVaultSession: GetUnlockedVaultSessionUseCase,
    persistUnlockedVault: PersistUnlockedVaultUseCase,
    commitUnlockedVaultSession: CommitUnlockedVaultSessionUseCase,
  ) {
    this.getUnlockedVaultSession = getUnlockedVaultSession;
    this.persistUnlockedVault = persistUnlockedVault;
    this.commitUnlockedVaultSession = commitUnlockedVaultSession;
  }

  async execute(params: RemoveEntryCommandParams): Promise<RemoveEntryResult> {
    const unlockedVaultSession = await this.getUnlockedVaultSession.execute();
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
