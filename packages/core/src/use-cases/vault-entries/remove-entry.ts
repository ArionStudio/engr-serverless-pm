import { removePasswordEntryFromVault } from "../../domain/vault/vault-entry.mutations";
import { PasswordEntryNotFoundError } from "../../errors/vault-entry.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { VaultSyncGuardService } from "../../services/sync";

export type RemoveEntryCommandParams = {
  vaultId: string;
  entryId: string;
};

export type RemoveEntryResult = {
  entryId: string;
  snapshotVersionVector: VersionVector;
  revisionTimestamp: number;
};

export class RemoveEntryUseCase {
  private readonly clock: ClockPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    clock: ClockPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.clock = clock;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(params: RemoveEntryCommandParams): Promise<RemoveEntryResult> {
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "remove entry",
      );

    const entryExists = unlockedVault.vault.entries.some(
      (entry) => entry.id === params.entryId,
    );

    if (!entryExists) {
      throw new PasswordEntryNotFoundError(params.vaultId, params.entryId);
    }

    const syncState = await this.vaultSyncGuard.prepareLocalMutation(
      params.vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: removePasswordEntryFromVault(
        unlockedVault.vault,
        params.entryId,
        unlockedVault.deviceId,
        this.clock.now(),
      ),
    };

    const persistedSnapshot =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.persistUnlockedVault(
            params.vaultId,
            updatedUnlockedVault,
            sourceSnapshotVersionVector,
          ),
      );

    if (syncState.syncConfig !== undefined) {
      await this.vaultSyncGuard.uploadPersistedLocalMutation(
        params.vaultId,
        syncState,
        persistedSnapshot.snapshot,
        updatedUnlockedVault,
        sessionId,
      );
    }

    await this.unlockedVaultSession.commitPersistedSnapshot(
      sessionId,
      {
        ...updatedUnlockedVault,
        trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
      },
      persistedSnapshot.snapshotVersionVector,
    );

    return {
      entryId: params.entryId,
      snapshotVersionVector: persistedSnapshot.snapshotVersionVector,
      revisionTimestamp: persistedSnapshot.revisionTimestamp,
    };
  }
}
