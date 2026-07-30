import type {
  SyncAccess,
  SyncSetupInput,
} from "../../domain/sync/sync-config.type";
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

  async execute(params: SetupSyncCommandParams): Promise<void> {
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
    } catch (error) {
      throw new InvalidSyncConfigError(error);
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

    const persistedSnapshot =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.persistUnlockedVault(
            params.vaultId,
            updatedUnlockedVault,
            sourceSnapshotVersionVector,
            { syncCredentialState: encryptedCredentialState },
          ),
      );

    await this.vaultSyncGuard.uploadPersistedInitialSyncSnapshot(
      params.vaultId,
      syncAccess,
      syncState.localSnapshot,
      persistedSnapshot.snapshot,
      unlockedVault,
      sessionId,
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      sessionId,
      {
        ...updatedUnlockedVault,
        trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
      },
      persistedSnapshot.snapshotVersionVector,
    );
  }
}
