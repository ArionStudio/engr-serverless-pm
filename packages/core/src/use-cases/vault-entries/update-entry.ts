import { passwordEntryInputSchema } from "../../domain/entry/password-entry.schema";
import { sanitizeEntryUrl } from "../../domain/entry/sanitized-entry-url.utils";
import { updatePasswordEntryInVault } from "../../domain/vault/vault-entry.mutations";
import {
  InvalidPasswordEntryError,
  PasswordEntryNotFoundError,
} from "../../errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/vault-snapshots/vault-snapshot.service";

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
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(params: UpdateEntryCommandParams): Promise<UpdateEntryResult> {
    const unlockedVaultSession = await this.unlockedVaultSession.get();

    if (
      unlockedVaultSession === null ||
      unlockedVaultSession.unlockedVault.vaultId !== params.vaultId
    ) {
      throw new VaultMustBeUnlockedError(params.vaultId, "update entry");
    }

    const { sourceSnapshotRevision, unlockedVault } = unlockedVaultSession;

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

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: updatePasswordEntryInVault(
        unlockedVault.vault,
        params.entryId,
        entryPayloadResult.data,
        unlockedVault.deviceId,
      ),
    };

    const persistedSnapshot = await this.vaultSnapshot.persistUnlockedVault(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotRevision,
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      persistedSnapshot.revision,
    );

    return {
      entryId: params.entryId,
      ...persistedSnapshot,
    };
  }
}
