import { passwordEntryInputSchema } from "../../domain/entry/password-entry.schema";
import { sanitizeEntryUrl } from "../../domain/entry/sanitized-entry-url.utils";
import { addPasswordEntryToVault } from "../../domain/vault/vault-entry.mutations";
import type { IdPort } from "../../ports/system/id.port";
import { InvalidPasswordEntryError } from "../../errors/vault-entry.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { VaultSyncGuardService } from "../../services/sync";

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
  snapshotVersionVector: VersionVector;
  revisionTimestamp: number;
};

export class AddEntryUseCase {
  private readonly ids: IdPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    ids: IdPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.ids = ids;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(params: AddEntryCommandParams): Promise<AddEntryResult> {
    const { sourceSnapshotVersionVector, unlockedVault } =
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

    const syncState = await this.vaultSyncGuard.prepareLocalMutation(
      params.vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );

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
      sourceSnapshotVersionVector,
    );

    if (syncState.syncConfig !== undefined) {
      await this.vaultSyncGuard.uploadPersistedLocalMutation(
        params.vaultId,
        syncState,
        await this.vaultSnapshot.requireLocalVaultSnapshot(params.vaultId),
      );
    }

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      persistedSnapshot.snapshotVersionVector,
    );

    return {
      entryId,
      ...persistedSnapshot,
    };
  }
}
