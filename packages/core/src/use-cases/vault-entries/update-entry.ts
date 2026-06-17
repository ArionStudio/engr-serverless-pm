import { passwordEntryInputSchema } from "../../domain/entry/password-entry.schema";
import { sanitizeEntryUrl } from "../../domain/entry/sanitized-entry-url.utils";
import { updatePasswordEntryInVault } from "../../domain/vault/vault-entry.mutations";
import {
  InvalidPasswordEntryError,
  PasswordEntryNotFoundError,
} from "../../errors/vault-entry.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { VaultSyncGuardService } from "../../services/sync";

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
  snapshotVersionVector: VersionVector;
  revisionTimestamp: number;
};

export class UpdateEntryUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(params: UpdateEntryCommandParams): Promise<UpdateEntryResult> {
    const { sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "update entry",
      );

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

    const syncState = await this.vaultSyncGuard.prepareLocalMutation(
      params.vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );

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
      entryId: params.entryId,
      ...persistedSnapshot,
    };
  }
}
