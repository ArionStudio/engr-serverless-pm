import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import { passwordEntrySchema } from "../../domain/entry/password-entry.schema";
import { sanitizeEntryUrl } from "../../domain/entry/sanitized-entry-url.utils";
import type { IdPort } from "../../ports/id.port";
import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import { InvalidPasswordEntryError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { PersistUnlockedVaultUseCase } from "../vault-snapshots/persist-unlocked-vault";

export type AddEntryCommandParams = {
  vaultId: string;
  entry: {
    password: string;
    login: string;
    tags: number[];
    url: string;
  };
};

export type AddEntryResult = {
  entryId: string;
  revision: number;
  revisionTimestamp: number;
  deviceId: string;
};

export class AddEntryUseCase {
  private readonly ids: IdPort;
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;
  private readonly persistUnlockedVault: PersistUnlockedVaultUseCase;

  constructor(
    ids: IdPort,
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
    persistUnlockedVault: PersistUnlockedVaultUseCase,
  ) {
    this.ids = ids;
    this.unlockedVaultRepository = unlockedVaultRepository;
    this.persistUnlockedVault = persistUnlockedVault;
  }

  async execute(params: AddEntryCommandParams): Promise<AddEntryResult> {
    const unlockedVault = await this.unlockedVaultRepository.getUnlockedVault();

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "add entry");
    }

    const entryId = await this.ids.generateId();

    let sanitizedUrl: string;

    try {
      sanitizedUrl = sanitizeEntryUrl(params.entry.url);
    } catch (error) {
      throw new InvalidPasswordEntryError(error);
    }

    const entryResult = passwordEntrySchema.safeParse({
      id: entryId,
      password: params.entry.password,
      login: params.entry.login,
      tags: params.entry.tags,
      sanitizedUrl,
    });

    if (!entryResult.success) {
      throw new InvalidPasswordEntryError(entryResult.error);
    }

    const entry: PasswordEntry = entryResult.data;

    await this.unlockedVaultRepository.saveUnlockedVault({
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        entries: [...unlockedVault.vault.entries, entry],
      },
    });

    const persistedSnapshot = await this.persistUnlockedVault.execute({
      vaultId: params.vaultId,
    });

    return {
      entryId,
      ...persistedSnapshot,
    };
  }
}
