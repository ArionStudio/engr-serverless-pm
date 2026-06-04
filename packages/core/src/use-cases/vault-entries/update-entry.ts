import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import { passwordEntryInputSchema } from "../../domain/entry/password-entry.schema";
import { sanitizeEntryUrl } from "../../domain/entry/sanitized-entry-url.utils";
import {
  InvalidPasswordEntryError,
  PasswordEntryNotFoundError,
} from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { CommitUnlockedVaultSessionUseCase } from "../vault-session/commit-unlocked-vault-session";
import type { GetUnlockedVaultSessionUseCase } from "../vault-session/get-unlocked-vault-session";
import type { PersistUnlockedVaultUseCase } from "../vault-snapshots/persist-unlocked-vault";

export type UpdateEntryCommandParams = {
  vaultId: string;
  entryId: string;
  entry: {
    password: string;
    login: string;
    tags: number[];
    url: string;
  };
};

export type UpdateEntryResult = {
  entryId: string;
  revision: number;
  revisionTimestamp: number;
  deviceId: string;
};

export class UpdateEntryUseCase {
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

  async execute(params: UpdateEntryCommandParams): Promise<UpdateEntryResult> {
    const unlockedVaultSession = await this.getUnlockedVaultSession.execute();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "update entry");
    }

    const entryIndex = unlockedVault.vault.entries.findIndex(
      (entry) => entry.id === params.entryId,
    );

    if (entryIndex === -1) {
      throw new PasswordEntryNotFoundError(params.vaultId, params.entryId);
    }

    let sanitizedUrl: string;

    try {
      sanitizedUrl = sanitizeEntryUrl(params.entry.url);
    } catch (error) {
      throw new InvalidPasswordEntryError(error);
    }

    const entryPayloadResult = passwordEntryInputSchema.safeParse({
      password: params.entry.password,
      login: params.entry.login,
      tags: params.entry.tags,
      sanitizedUrl,
    });

    if (!entryPayloadResult.success) {
      throw new InvalidPasswordEntryError(entryPayloadResult.error);
    }

    const entry: PasswordEntry = {
      id: params.entryId,
      ...entryPayloadResult.data,
    };
    const entries = [...unlockedVault.vault.entries];
    entries[entryIndex] = entry;

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        entries,
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
