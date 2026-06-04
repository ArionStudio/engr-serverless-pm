import { PasswordEntryNotFoundError } from "../../application/errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import type { CommitUnlockedVaultSessionService } from "../../application/vault-session/commit-unlocked-vault-session.service";
import type { GetUnlockedVaultSessionService } from "../../application/vault-session/get-unlocked-vault-session.service";
import type { PersistUnlockedVaultService } from "../../application/vault-snapshots/persist-unlocked-vault.service";

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
  private readonly getUnlockedVaultSession: GetUnlockedVaultSessionService;
  private readonly persistUnlockedVault: PersistUnlockedVaultService;
  private readonly commitUnlockedVaultSession: CommitUnlockedVaultSessionService;

  constructor(
    getUnlockedVaultSession: GetUnlockedVaultSessionService,
    persistUnlockedVault: PersistUnlockedVaultService,
    commitUnlockedVaultSession: CommitUnlockedVaultSessionService,
  ) {
    this.getUnlockedVaultSession = getUnlockedVaultSession;
    this.persistUnlockedVault = persistUnlockedVault;
    this.commitUnlockedVaultSession = commitUnlockedVaultSession;
  }

  async execute(params: RemoveEntryCommandParams): Promise<RemoveEntryResult> {
    const unlockedVaultSession = await this.getUnlockedVaultSession.get();
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

    const persistedSnapshot = await this.persistUnlockedVault.persist(
      params.vaultId,
      updatedUnlockedVault,
    );

    await this.commitUnlockedVaultSession.commit(
      updatedUnlockedVault,
      persistedSnapshot.revision,
    );

    return {
      entryId: params.entryId,
      ...persistedSnapshot,
    };
  }
}
