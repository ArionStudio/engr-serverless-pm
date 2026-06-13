import { passwordEntryInputSchema } from "../../domain/entry/password-entry.schema";
import { sanitizeEntryUrl } from "../../domain/entry/sanitized-entry-url.utils";
import { addPasswordEntryToVault } from "../../domain/vault/vault-entry.mutations";
import type { IdPort } from "../../ports/system/id.port";
import { InvalidPasswordEntryError } from "../../errors/vault-entry.errors";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/vault-snapshots/vault-snapshot.service";

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
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    ids: IdPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.ids = ids;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(params: AddEntryCommandParams): Promise<AddEntryResult> {
    const { sourceSnapshotRevision, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "add entry",
      );

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

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: addPasswordEntryToVault(
        unlockedVault.vault,
        entryId,
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
      entryId,
      ...persistedSnapshot,
    };
  }
}
