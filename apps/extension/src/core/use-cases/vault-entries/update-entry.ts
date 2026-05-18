import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import { passwordEntrySchema } from "../../domain/entry/password-entry.schema";
import { sanitizeEntryUrl } from "../../domain/entry/sanitized-entry-url.utils";
import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import {
  InvalidPasswordEntryError,
  PasswordEntryNotFoundError,
} from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
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
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;
  private readonly persistUnlockedVault: PersistUnlockedVaultUseCase;

  constructor(
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
    persistUnlockedVault: PersistUnlockedVaultUseCase,
  ) {
    this.unlockedVaultRepository = unlockedVaultRepository;
    this.persistUnlockedVault = persistUnlockedVault;
  }

  async execute(params: UpdateEntryCommandParams): Promise<UpdateEntryResult> {
    const unlockedVault = await this.unlockedVaultRepository.getUnlockedVault();

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

    const entryResult = passwordEntrySchema.safeParse({
      id: params.entryId,
      password: params.entry.password,
      login: params.entry.login,
      tags: params.entry.tags,
      sanitizedUrl,
    });

    if (!entryResult.success) {
      throw new InvalidPasswordEntryError(entryResult.error);
    }

    const entry: PasswordEntry = entryResult.data;
    const entries = [...unlockedVault.vault.entries];
    entries[entryIndex] = entry;

    await this.unlockedVaultRepository.saveUnlockedVault({
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        entries,
      },
    });

    const persistedSnapshot = await this.persistUnlockedVault.execute({
      vaultId: params.vaultId,
    });

    return {
      entryId: params.entryId,
      ...persistedSnapshot,
    };
  }
}
