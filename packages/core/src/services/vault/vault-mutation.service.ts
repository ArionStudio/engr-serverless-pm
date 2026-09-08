import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import type { Vault } from "../../domain/vault/vault";
import type { UnlockedVaultSessionService } from "../session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../sync";

import type { VaultMutationResult } from "./vault-mutation.type";

export class VaultMutationService {
  private readonly session: UnlockedVaultSessionService;
  private readonly syncGuard: VaultSyncGuardService;
  private readonly snapshot: VaultSnapshotService;

  constructor(
    session: UnlockedVaultSessionService,
    syncGuard: VaultSyncGuardService,
    snapshot: VaultSnapshotService,
  ) {
    this.session = session;
    this.syncGuard = syncGuard;
    this.snapshot = snapshot;
  }

  async persist(
    vaultId: string,
    operation: string,
    mutate: (vault: Vault, deviceId: string) => Promise<Vault> | Vault,
  ): Promise<VaultMutationResult> {
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.session.requireUnlockedVaultContext(vaultId, operation);
    const updatedVault = await mutate(
      unlockedVault.vault,
      unlockedVault.deviceId,
    );
    const syncState = await this.syncGuard.prepareLocalMutation(
      vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );
    const updatedUnlockedVault = { ...unlockedVault, vault: updatedVault };
    const { persistedSnapshot, preparedRestore } =
      await this.session.persistForActiveSession(
        sessionId,
        vaultId,
        async () => {
          const preparedRestore =
            syncState.syncAccess === undefined
              ? undefined
              : await this.snapshot.prepareLocalVaultSnapshotRestore(
                  syncState.localSnapshot,
                  unlockedVault,
                );
          const persistedSnapshot = await this.snapshot.persistUnlockedVault(
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
      syncUpload = await this.syncGuard.uploadPersistedLocalMutation(
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
      await this.session.commitPersistedSnapshot(
        sessionId,
        committedUnlockedVault,
        persistedSnapshot.snapshotVersionVector,
      );
    } else {
      await this.session.commitPersistedSnapshotIfSessionIsActive(
        sessionId,
        committedUnlockedVault,
        persistedSnapshot.snapshotVersionVector,
      );
    }
    return {
      snapshotVersionVector: persistedSnapshot.snapshotVersionVector,
      revisionTimestamp: persistedSnapshot.revisionTimestamp,
      syncUpload,
      syncConfigured: syncState.syncAccess !== undefined,
    };
  }
}
