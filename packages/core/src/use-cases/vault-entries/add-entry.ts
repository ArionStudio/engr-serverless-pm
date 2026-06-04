import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import { passwordEntryInputSchema } from "../../domain/entry/password-entry.schema";
import { sanitizeEntryUrl } from "../../domain/entry/sanitized-entry-url.utils";
import type { IdPort } from "../../ports/system/id.port";
import type { UnlockedVaultRepositoryPort } from "../../ports/vault/unlocked-vault-repository.port";
import { InvalidPasswordEntryError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { CommitUnlockedVaultSessionUseCase } from "../vault-session/commit-unlocked-vault-session";
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
  private readonly commitUnlockedVaultSession: CommitUnlockedVaultSessionUseCase;

  constructor(
    ids: IdPort,
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
    persistUnlockedVault: PersistUnlockedVaultUseCase,
    commitUnlockedVaultSession: CommitUnlockedVaultSessionUseCase,
  ) {
    this.ids = ids;
    this.unlockedVaultRepository = unlockedVaultRepository;
    this.persistUnlockedVault = persistUnlockedVault;
    this.commitUnlockedVaultSession = commitUnlockedVaultSession;
  }

  async execute(params: AddEntryCommandParams): Promise<AddEntryResult> {
    const unlockedVaultSession =
      await this.unlockedVaultRepository.getUnlockedVaultSession();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "add entry");
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

    const entryId = await this.ids.generateId();

    const entry: PasswordEntry = {
      id: entryId,
      ...entryPayloadResult.data,
    };
    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        entries: [...unlockedVault.vault.entries, entry],
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
      entryId,
      ...persistedSnapshot,
    };
  }
}
