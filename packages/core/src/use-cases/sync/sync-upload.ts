import {
  areVaultSnapshotIdentitiesEqual,
  areVaultSnapshotDescriptorsEqual,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import type {
  VaultSnapshotDescriptor,
  VaultSnapshotIdentity,
} from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  SyncConflictDetectedError,
  SyncNotConfiguredError,
  SyncRemovalPendingError,
} from "../../errors/sync.errors";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../../services/sync";

export type SyncUploadCommandParams = {
  readonly vaultId: string;
};

export type SyncUploadResult = {
  readonly syncUpload: SyncUploadStatus;
};

export class SyncUploadUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultSyncGuard: VaultSyncGuardService;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultSyncGuard: VaultSyncGuardService,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultSyncGuard = vaultSyncGuard;
  }

  async execute(params: SyncUploadCommandParams): Promise<SyncUploadResult> {
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "sync upload",
      );
    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "sync upload");
    }

    if (unlockedVault.vault.syncRemovalPending !== undefined) {
      throw new SyncRemovalPendingError(params.vaultId, "sync upload");
    }

    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );
    const syncAccess = await this.vaultSyncGuard.requireSyncAccess(
      params.vaultId,
      unlockedVault,
    );
    const pending = await this.vaultSyncGuard.getPendingSnapshotUpload(
      params.vaultId,
      unlockedVault,
    );
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncAccess,
        params.vaultId,
      );
    const localSnapshotDescriptor = toVaultSnapshotDescriptor(
      params.vaultId,
      localSnapshot,
    );
    const signedExpectedRemoteSnapshotIdentity =
      localSnapshot.metadata.uploadExpectedRemoteSnapshotIdentity;

    if (
      signedExpectedRemoteSnapshotIdentity === undefined ||
      (signedExpectedRemoteSnapshotIdentity !== null &&
        signedExpectedRemoteSnapshotIdentity.descriptor.vaultId !==
          params.vaultId)
    ) {
      throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
    }
    const preparedSnapshot =
      await this.vaultSnapshot.prepareLocalVaultSnapshotRestore(
        localSnapshot,
        unlockedVault,
      );

    if (pending !== undefined) {
      requirePendingSnapshotUploadMatchesLocal(
        params.vaultId,
        pending,
        localSnapshotDescriptor,
        unlockedVault.trustedSnapshotContext.snapshotDigest,
        signedExpectedRemoteSnapshotIdentity,
      );
    }

    if (
      remoteSnapshotDescriptor !== null &&
      areVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        localSnapshotDescriptor,
      )
    ) {
      await this.requireRemoteSnapshotMatchesLocalCandidate({
        vaultId: params.vaultId,
        syncAccess,
        remoteSnapshotDescriptor,
        unlockedVault,
        expectedSnapshotDigest:
          unlockedVault.trustedSnapshotContext.snapshotDigest,
      });
      const currentPending = await this.vaultSyncGuard.getPendingSnapshotUpload(
        params.vaultId,
        unlockedVault,
      );

      if (currentPending === undefined) {
        return { syncUpload: "complete" };
      }

      requirePendingSnapshotUploadMatchesLocal(
        params.vaultId,
        currentPending,
        localSnapshotDescriptor,
        unlockedVault.trustedSnapshotContext.snapshotDigest,
        signedExpectedRemoteSnapshotIdentity,
      );
      const cleared = await this.vaultSyncGuard.clearPendingSnapshotUpload({
        sessionId,
        vaultId: params.vaultId,
        unlockedVault,
        snapshot: localSnapshot,
        snapshotDigest: unlockedVault.trustedSnapshotContext.snapshotDigest,
        checkpoint: preparedSnapshot.checkpoint,
        pending: currentPending,
      });

      return { syncUpload: cleared ? "complete" : "pending" };
    }

    if (
      !areNullableVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        signedExpectedRemoteSnapshotIdentity?.descriptor ?? null,
      )
    ) {
      if (
        remoteSnapshotDescriptor !== null &&
        remoteSnapshotDescriptor.vaultId !== params.vaultId
      ) {
        throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
      }

      throw new SyncConflictDetectedError(params.vaultId);
    }

    if (signedExpectedRemoteSnapshotIdentity !== null) {
      await this.requireHistoricalRemoteSnapshotMatchesIdentity({
        vaultId: params.vaultId,
        syncAccess,
        remoteSnapshotIdentity: signedExpectedRemoteSnapshotIdentity,
        currentSnapshot: localSnapshot,
        unlockedVault,
      });
    }

    if (pending !== undefined) {
      try {
        return {
          syncUpload: await this.vaultSyncGuard.retryPendingSnapshotUpload({
            sessionId,
            vaultId: params.vaultId,
            unlockedVault,
            syncAccess,
            snapshot: localSnapshot,
            snapshotDigest: unlockedVault.trustedSnapshotContext.snapshotDigest,
            checkpoint: preparedSnapshot.checkpoint,
            pending,
          }),
        };
      } catch (error) {
        if (error instanceof RemoteVaultSnapshotChangedError) {
          throw new SyncConflictDetectedError(params.vaultId);
        }

        throw error;
      }
    }

    if (signedExpectedRemoteSnapshotIdentity !== null) {
      const relation = compareVaultSnapshotDescriptors(
        localSnapshotDescriptor,
        signedExpectedRemoteSnapshotIdentity.descriptor,
      );

      if (relation === "equal") {
        throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
      }

      if (relation === "remote_ahead") {
        throw new RemoteVaultSnapshotAheadError(params.vaultId);
      }

      if (relation === "broken") {
        throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
      }
    }

    let stagedIntent:
      | Parameters<
          VaultSyncGuardService["clearStagedSnapshotUploadIntent"]
        >[0]["intent"]
      | undefined;

    try {
      return {
        syncUpload: await this.vaultSyncGuard.uploadTrackedSnapshot({
          sessionId,
          vaultId: params.vaultId,
          unlockedVault,
          syncAccess,
          snapshot: localSnapshot,
          snapshotDigest: unlockedVault.trustedSnapshotContext.snapshotDigest,
          checkpoint: preparedSnapshot.checkpoint,
          expectedRemoteSnapshotIdentity: signedExpectedRemoteSnapshotIdentity,
          onIntentStaged: (intent) => {
            stagedIntent = intent;
          },
        }),
      };
    } catch (error) {
      if (stagedIntent !== undefined) {
        await this.vaultSyncGuard.clearStagedSnapshotUploadIntent({
          sessionId,
          vaultId: params.vaultId,
          snapshot: localSnapshot,
          snapshotDigest: unlockedVault.trustedSnapshotContext.snapshotDigest,
          checkpoint: preparedSnapshot.checkpoint,
          intent: stagedIntent,
        });
      }

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }
  }

  private async requireRemoteSnapshotMatchesLocalCandidate(params: {
    readonly vaultId: string;
    readonly syncAccess: Parameters<
      SyncProviderPort["downloadVaultSnapshot"]
    >[0];
    readonly remoteSnapshotDescriptor: VaultSnapshotDescriptor;
    readonly unlockedVault: Awaited<
      ReturnType<UnlockedVaultSessionService["requireUnlockedVaultContext"]>
    >["unlockedVault"];
    readonly expectedSnapshotDigest: string;
  }): Promise<void> {
    let remoteSnapshot;

    try {
      remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
        params.syncAccess,
        params.remoteSnapshotDescriptor,
      );
    } catch (error) {
      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }

    const verifiedRemoteSnapshot =
      await this.vaultSnapshot.verifyCandidateSnapshotTrust(
        params.vaultId,
        remoteSnapshot,
        params.unlockedVault,
      );

    if (
      verifiedRemoteSnapshot.snapshotDigest !== params.expectedSnapshotDigest
    ) {
      throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
    }
  }

  private async requireHistoricalRemoteSnapshotMatchesIdentity(params: {
    readonly vaultId: string;
    readonly syncAccess: Parameters<
      SyncProviderPort["downloadVaultSnapshot"]
    >[0];
    readonly remoteSnapshotIdentity: VaultSnapshotIdentity;
    readonly currentSnapshot: Parameters<
      VaultSnapshotService["verifyHistoricalSnapshotTrust"]
    >[2];
    readonly unlockedVault: Awaited<
      ReturnType<UnlockedVaultSessionService["requireUnlockedVaultContext"]>
    >["unlockedVault"];
  }): Promise<void> {
    let remoteSnapshot;

    try {
      remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
        params.syncAccess,
        params.remoteSnapshotIdentity.descriptor,
      );
    } catch (error) {
      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }

    const verifiedRemoteSnapshot =
      await this.vaultSnapshot.verifyHistoricalSnapshotTrust(
        params.vaultId,
        remoteSnapshot,
        params.currentSnapshot,
        params.unlockedVault,
      );

    if (
      verifiedRemoteSnapshot.snapshotDigest !==
      params.remoteSnapshotIdentity.snapshotDigest
    ) {
      throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
    }
  }
}

type PendingSnapshotUpload = NonNullable<
  Awaited<ReturnType<VaultSyncGuardService["getPendingSnapshotUpload"]>>
>;

function requirePendingSnapshotUploadMatchesLocal(
  vaultId: string,
  pending: PendingSnapshotUpload,
  localSnapshotDescriptor: VaultSnapshotDescriptor,
  localSnapshotDigest: string,
  signedExpectedRemoteSnapshotIdentity: VaultSnapshotIdentity | null,
): void {
  if (
    !areVaultSnapshotIdentitiesEqual(
      {
        descriptor: localSnapshotDescriptor,
        snapshotDigest: localSnapshotDigest,
      },
      pending.candidateSnapshotIdentity,
    ) ||
    !areNullableVaultSnapshotIdentitiesEqual(
      signedExpectedRemoteSnapshotIdentity,
      pending.expectedRemoteSnapshotIdentity,
    )
  ) {
    throw new RemoteVaultSnapshotIntegrityError(vaultId);
  }
}

function areNullableVaultSnapshotIdentitiesEqual(
  left: VaultSnapshotIdentity | null,
  right: VaultSnapshotIdentity | null,
): boolean {
  if (left === null || right === null) {
    return left === null && right === null;
  }

  return areVaultSnapshotIdentitiesEqual(left, right);
}

function areNullableVaultSnapshotDescriptorsEqual(
  left: VaultSnapshotDescriptor | null,
  right: VaultSnapshotDescriptor | null,
): boolean {
  if (left === null || right === null) {
    return left === null && right === null;
  }

  return areVaultSnapshotDescriptorsEqual(left, right);
}
