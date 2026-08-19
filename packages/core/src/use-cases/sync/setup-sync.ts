import type {
  SyncAccess,
  SyncSetupInput,
} from "../../domain/sync/sync-config.type";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import {
  InvalidSyncConfigError,
  RemoteVaultSnapshotAheadError,
  SyncAlreadyConfiguredError,
} from "../../errors/sync.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../../services/sync";

export type SetupSyncCommandParams = {
  readonly vaultId: string;
  readonly syncConfig: SyncSetupInput;
};

export type SetupSyncResult = {
  readonly syncUpload: SyncUploadStatus;
};

export class SetupSyncUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly crypto: CryptoPort;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultSnapshot: VaultSnapshotService,
    crypto: CryptoPort,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultSnapshot = vaultSnapshot;
    this.crypto = crypto;
  }

  async execute(params: SetupSyncCommandParams): Promise<SetupSyncResult> {
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "setup sync",
      );

    if (unlockedVault.vault.syncTarget !== undefined) {
      throw new SyncAlreadyConfiguredError(params.vaultId);
    }

    const syncState = await this.vaultSyncGuard.prepareLocalMutation(
      params.vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );

    let syncAccess: SyncAccess;

    try {
      syncAccess = await this.syncProvider.setup(params.syncConfig);
    } catch {
      throw new InvalidSyncConfigError();
    }

    const encryptedCredentialState =
      await this.crypto.encryptDeviceSyncCredentialState(
        {
          currentCredentials: syncAccess.credentials,
        },
        unlockedVault.deviceLocalProtectionKey,
        {
          vaultId: params.vaultId,
          deviceId: unlockedVault.deviceId,
          provider: syncAccess.target.provider,
          target: syncAccess.target,
        },
      );

    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncAccess,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor !== null) {
      throw new RemoteVaultSnapshotAheadError(params.vaultId);
    }

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        syncTarget: syncAccess.target,
      },
    };

    const { persistedSnapshot, preparedRestore } =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () => {
          const preparedRestore =
            await this.vaultSnapshot.prepareLocalVaultSnapshotRestore(
              syncState.localSnapshot,
              unlockedVault,
              null,
            );
          const persistedSnapshot =
            await this.vaultSnapshot.persistUnlockedVault(
              params.vaultId,
              updatedUnlockedVault,
              sourceSnapshotVersionVector,
              {
                uploadExpectedRemoteSnapshotIdentity: null,
                expectedSyncCredentialState: null,
                syncCredentialState: encryptedCredentialState,
              },
            );

          return { persistedSnapshot, preparedRestore };
        },
      );

    const syncUpload =
      await this.vaultSyncGuard.uploadPersistedInitialSyncSnapshot(
        params.vaultId,
        syncAccess,
        syncState.localSnapshot,
        persistedSnapshot.snapshot,
        persistedSnapshot.trustedSnapshotContext.snapshotDigest,
        persistedSnapshot.checkpoint,
        encryptedCredentialState,
        updatedUnlockedVault,
        preparedRestore,
        sessionId,
      );

    await this.unlockedVaultSession.commitPersistedSnapshotIfSessionIsActive(
      sessionId,
      {
        ...updatedUnlockedVault,
        trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
      },
      persistedSnapshot.snapshotVersionVector,
    );

    return { syncUpload };
  }
}
