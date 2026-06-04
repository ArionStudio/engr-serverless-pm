import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import { passwordEntryInputSchema } from "../../domain/entry/password-entry.schema";
import { sanitizeEntryUrl } from "../../domain/entry/sanitized-entry-url.utils";
import type { IdPort } from "../../ports/system/id.port";
import { InvalidPasswordEntryError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { CommitUnlockedVaultSessionService } from "../../application/vault-session/commit-unlocked-vault-session.service";
import type { GetUnlockedVaultSessionService } from "../../application/vault-session/get-unlocked-vault-session.service";
import type { PersistUnlockedVaultService } from "../../application/vault-snapshots/persist-unlocked-vault.service";

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
  private readonly getUnlockedVaultSession: GetUnlockedVaultSessionService;
  private readonly persistUnlockedVault: PersistUnlockedVaultService;
  private readonly commitUnlockedVaultSession: CommitUnlockedVaultSessionService;

  constructor(
    ids: IdPort,
    getUnlockedVaultSession: GetUnlockedVaultSessionService,
    persistUnlockedVault: PersistUnlockedVaultService,
    commitUnlockedVaultSession: CommitUnlockedVaultSessionService,
  ) {
    this.ids = ids;
    this.getUnlockedVaultSession = getUnlockedVaultSession;
    this.persistUnlockedVault = persistUnlockedVault;
    this.commitUnlockedVaultSession = commitUnlockedVaultSession;
  }

  async execute(params: AddEntryCommandParams): Promise<AddEntryResult> {
    const unlockedVaultSession = await this.getUnlockedVaultSession.get();
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

    const persistedSnapshot = await this.persistUnlockedVault.persist(
      params.vaultId,
      updatedUnlockedVault,
    );

    await this.commitUnlockedVaultSession.commit(
      updatedUnlockedVault,
      persistedSnapshot.revision,
    );

    return {
      entryId,
      ...persistedSnapshot,
    };
  }
}
