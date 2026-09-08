import {
  captureExpectedEntryVersion,
  requireExpectedEntryVersion,
} from "../../domain/entry/entry-version.policy";
import { removePasswordEntryFromVault } from "../../domain/vault/vault-entry.mutations";
import { PasswordEntryNotFoundError } from "../../errors/vault-entry.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { VaultSyncGuardService } from "../../services/sync";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";

export type RemoveEntryCommandParams = {
  vaultId: string;
  entryId: string;
  expectedEntryVersionVector: Readonly<VersionVector>;
};

export type RemoveEntryResult = {
  entryId: string;
  snapshotVersionVector: VersionVector;
  revisionTimestamp: number;
  syncUpload: SyncUploadStatus;
  syncConfigured: boolean;
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
    const { vaultId, entryId } = params;
    const expectedEntryVersion = captureExpectedEntryVersion(
      params.expectedEntryVersionVector,
    );
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        vaultId,
        "remove entry",
      );

    const entry = unlockedVault.vault.entries.find(
      (entry) => entry.id === entryId,
    );

    if (entry === undefined) {
      throw new PasswordEntryNotFoundError(vaultId, entryId);
    }

    requireExpectedEntryVersion(entry.versionVector, expectedEntryVersion);

    const syncState = await this.vaultSyncGuard.prepareLocalMutation(
      vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: removePasswordEntryFromVault(
        unlockedVault.vault,
        entryId,
        unlockedVault.deviceId,
        this.clock.now(),
      ),
    };
    const { persistedSnapshot, preparedRestore } =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        vaultId,
        async () => {
          const preparedRestore =
            syncState.syncAccess === undefined
              ? undefined
              : await this.vaultSnapshot.prepareLocalVaultSnapshotRestore(
                  syncState.localSnapshot,
                  unlockedVault,
                );
          const persistedSnapshot =
            await this.vaultSnapshot.persistUnlockedVault(
              vaultId,
              updatedUnlockedVault,
              sourceSnapshotVersionVector,
              syncState.remoteSnapshotIdentity === undefined
                ? {}
                : {
                    uploadExpectedRemoteSnapshotIdentity:
                      syncState.remoteSnapshotIdentity,
                    expectedSyncCredentialState: syncState.syncCredentialState,
                    syncCredentialState: syncState.syncCredentialState,
                  },
            );

          return { persistedSnapshot, preparedRestore };
        },
      );

    let syncUpload: SyncUploadStatus = "complete";

    if (syncState.syncAccess !== undefined) {
      if (preparedRestore === undefined) {
        throw new Error("Synchronized mutation rollback was not prepared.");
      }

      syncUpload = await this.vaultSyncGuard.uploadPersistedLocalMutation(
        vaultId,
        syncState,
        persistedSnapshot.snapshot,
        persistedSnapshot.trustedSnapshotContext.snapshotDigest,
        persistedSnapshot.checkpoint,
        updatedUnlockedVault,
        preparedRestore,
        sessionId,
      );
    }

    const committedUnlockedVault = {
      ...updatedUnlockedVault,
      trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
    };

    if (syncState.syncAccess === undefined) {
      await this.unlockedVaultSession.commitPersistedSnapshot(
        sessionId,
        committedUnlockedVault,
        persistedSnapshot.snapshotVersionVector,
      );
    } else {
      await this.unlockedVaultSession.commitPersistedSnapshotIfSessionIsActive(
        sessionId,
        committedUnlockedVault,
        persistedSnapshot.snapshotVersionVector,
      );
    }

    return {
      entryId,
      snapshotVersionVector: persistedSnapshot.snapshotVersionVector,
      revisionTimestamp: persistedSnapshot.revisionTimestamp,
      syncUpload,
      syncConfigured: syncState.syncAccess !== undefined,
    };
  }
}
