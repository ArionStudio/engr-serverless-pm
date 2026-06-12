import {
  areRemoteVaultSnapshotDescriptorsEqual,
  compareLocalAndRemoteSnapshotDescriptors,
} from "../../domain/sync/vault-snapshot-version.utils";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../application/vault-session/unlocked-vault-session.service";
import { VaultSnapshotNotFoundError } from "../../application/errors/unlock-vault.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  SyncConflictDetectedError,
  SyncNotConfiguredError,
} from "../../application/errors/sync.errors";

export type SyncUploadCommandParams = {
  readonly vaultId: string;
};

export class SyncUploadUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultLocalRepository = vaultLocalRepository;
  }

  async execute(params: SyncUploadCommandParams): Promise<void> {
    const unlockedVaultSession = await this.unlockedVaultSession.get();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "sync upload");
    }

    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "sync upload");
    }

    const localSnapshot = await this.vaultLocalRepository.getVaultSnapshot(
      params.vaultId,
    );

    if (localSnapshot === null) {
      throw new VaultSnapshotNotFoundError(params.vaultId);
    }

    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncConfig,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor === null) {
      await this.uploadVaultSnapshotOrThrowConflict(
        syncConfig,
        localSnapshot,
        null,
        params.vaultId,
      );
      return;
    }

    const localSnapshotDescriptor = {
      vaultId: localSnapshot.metadata.id,
      versionVector: unlockedVault.vault.versionVector,
      revisionTimestamp: localSnapshot.metadata.revisionTimestamp,
    };
    const relation = compareLocalAndRemoteSnapshotDescriptors(
      localSnapshotDescriptor,
      remoteSnapshotDescriptor,
    );

    if (
      relation === "equal" &&
      areRemoteVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        localSnapshotDescriptor,
      )
    ) {
      return;
    }

    if (relation === "equal") {
      throw new RemoteVaultSnapshotAheadError(params.vaultId);
    }

    if (relation === "remote_ahead") {
      throw new RemoteVaultSnapshotAheadError(params.vaultId);
    }

    if (relation === "diverged") {
      throw new SyncConflictDetectedError(params.vaultId);
    }

    if (relation === "local_ahead") {
      await this.uploadVaultSnapshotOrThrowConflict(
        syncConfig,
        localSnapshot,
        remoteSnapshotDescriptor,
        params.vaultId,
      );
      return;
    }
  }

  private async uploadVaultSnapshotOrThrowConflict(
    syncConfig: Parameters<SyncProviderPort["uploadVaultSnapshot"]>[0],
    localSnapshot: Parameters<SyncProviderPort["uploadVaultSnapshot"]>[1],
    expectedRemoteSnapshotDescriptor: Parameters<
      SyncProviderPort["uploadVaultSnapshot"]
    >[2],
    vaultId: string,
  ): Promise<void> {
    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncConfig,
        localSnapshot,
        expectedRemoteSnapshotDescriptor,
      );
    } catch (error) {
      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(vaultId);
      }

      throw error;
    }
  }
}
