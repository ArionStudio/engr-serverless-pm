import {
  areVaultSnapshotIdentitiesEqual,
  areVaultSnapshotDescriptorsEqual,
  cloneVaultSnapshotIdentity,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import type { LocalVaultTrustCheckpoint } from "../../domain/device-trust";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { VaultSnapshotIdentity } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { SyncAccess } from "../../domain/sync/sync-config.type";
import type {
  DeviceSyncCredentialState,
  EncryptedDeviceSyncCredentialState,
} from "../../domain/sync/device-sync-credential-state";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  RemoteVaultSnapshotNotFoundError,
  SyncConflictDetectedError,
  LocalVaultSnapshotAheadError,
  LocalSyncCredentialsMissingError,
  ProviderCredentialRevocationPendingError,
  SyncRemovalPendingError,
} from "../../errors/sync.errors";
import { PersistedVaultRollbackIncompleteError } from "../../errors/vault-snapshot.errors";
import { UnlockedVaultSessionExpiredError } from "../../errors/vault-session.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type {
  PreparedSyncUpload,
  SyncProviderPort,
  SyncUploadOutcome,
} from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../session/unlocked-vault-session.service";
import type {
  PreparedLocalVaultSnapshotRestore,
  VaultSnapshotService,
} from "../snapshot/vault-snapshot.service";
import {
  resolveNonStartedSyncProviderUploadOutcome,
  resolveSyncProviderUploadStatus,
} from "./sync-provider-outcome.policy";

type LocalMutationSyncState =
  | {
      readonly localSnapshot: VaultSnapshot;
      readonly syncAccess?: undefined;
      readonly remoteSnapshotIdentity?: undefined;
    }
  | {
      readonly localSnapshot: VaultSnapshot;
      readonly syncAccess: SyncAccess;
      readonly syncCredentialState: EncryptedDeviceSyncCredentialState;
      readonly remoteSnapshotIdentity: VaultSnapshotIdentity;
    };

type PendingSnapshotUpload = NonNullable<
  DeviceSyncCredentialState["pendingSnapshotUpload"]
>;

type StagedSnapshotUploadIntent = {
  readonly clear: EncryptedDeviceSyncCredentialState;
  readonly pending: EncryptedDeviceSyncCredentialState;
};

export class VaultSyncGuardService {
  private readonly syncProvider: SyncProviderPort;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly crypto: CryptoPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    syncProvider: SyncProviderPort,
    vaultSnapshot: VaultSnapshotService,
    unlockedVaultSession: UnlockedVaultSessionService,
    crypto: CryptoPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.syncProvider = syncProvider;
    this.vaultSnapshot = vaultSnapshot;
    this.unlockedVaultSession = unlockedVaultSession;
    this.crypto = crypto;
    this.vaultLocalRepository = vaultLocalRepository;
  }

  async requireReadyForLocalMutation(
    vaultId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
  ): Promise<VaultSnapshot> {
    return (
      await this.prepareLocalMutation(
        vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      )
    ).localSnapshot;
  }

  async prepareLocalMutation(
    vaultId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
  ): Promise<LocalMutationSyncState> {
    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );
    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      return {
        localSnapshot,
      };
    }

    if (unlockedVault.vault.syncRemovalPending !== undefined) {
      throw new SyncRemovalPendingError(vaultId, "modify vault data");
    }

    const {
      encryptedState: syncCredentialState,
      state: decryptedSyncCredentialState,
      syncAccess,
    } = await this.requireSyncCredentialState(vaultId, unlockedVault);

    if (decryptedSyncCredentialState.pendingSnapshotUpload !== undefined) {
      throw new LocalVaultSnapshotAheadError(vaultId);
    }
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncAccess,
        vaultId,
      );

    if (remoteSnapshotDescriptor === null) {
      throw new RemoteVaultSnapshotNotFoundError(vaultId);
    }

    const localSnapshotDescriptor = toVaultSnapshotDescriptor(
      vaultId,
      localSnapshot,
    );
    const relation = compareVaultSnapshotDescriptors(
      localSnapshotDescriptor,
      remoteSnapshotDescriptor,
    );

    if (relation === "remote_ahead") {
      throw new RemoteVaultSnapshotAheadError(vaultId);
    }

    if (relation === "local_ahead") {
      throw new LocalVaultSnapshotAheadError(vaultId);
    }

    if (relation === "broken") {
      throw new RemoteVaultSnapshotIntegrityError(vaultId);
    }

    if (
      relation === "equal" &&
      !areVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        localSnapshotDescriptor,
      )
    ) {
      throw new RemoteVaultSnapshotIntegrityError(vaultId);
    }

    let remoteSnapshot: VaultSnapshot;

    try {
      remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
        syncAccess,
        remoteSnapshotDescriptor,
      );
    } catch (error) {
      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(vaultId);
      }

      throw error;
    }

    const remoteSnapshotDigest =
      await this.crypto.digestVaultSnapshot(remoteSnapshot);

    if (
      remoteSnapshotDigest !==
      unlockedVault.trustedSnapshotContext.snapshotDigest
    ) {
      throw new RemoteVaultSnapshotIntegrityError(vaultId);
    }

    return {
      localSnapshot,
      syncAccess,
      syncCredentialState,
      remoteSnapshotIdentity: {
        descriptor: remoteSnapshotDescriptor,
        snapshotDigest: remoteSnapshotDigest,
      },
    };
  }

  async requireSyncAccess(
    vaultId: string,
    unlockedVault: UnlockedVault,
  ): Promise<SyncAccess> {
    return (await this.requireSyncCredentialState(vaultId, unlockedVault))
      .syncAccess;
  }

  async requireSnapshotUploadReconciled(
    vaultId: string,
    unlockedVault: UnlockedVault,
  ): Promise<void> {
    const { state } = await this.requireSyncCredentialState(
      vaultId,
      unlockedVault,
    );

    if (state.pendingSnapshotUpload !== undefined) {
      throw new LocalVaultSnapshotAheadError(vaultId);
    }
  }

  async getPendingSnapshotUpload(
    vaultId: string,
    unlockedVault: UnlockedVault,
  ): Promise<PendingSnapshotUpload | undefined> {
    const { state } = await this.requireSyncCredentialState(
      vaultId,
      unlockedVault,
    );
    const pending = state.pendingSnapshotUpload;

    if (pending === undefined) {
      return undefined;
    }

    if (
      pending.candidateSnapshotIdentity.descriptor.vaultId !== vaultId ||
      (pending.expectedRemoteSnapshotIdentity !== null &&
        pending.expectedRemoteSnapshotIdentity.descriptor.vaultId !== vaultId)
    ) {
      throw new RemoteVaultSnapshotIntegrityError(vaultId);
    }

    return {
      candidateSnapshotIdentity: cloneVaultSnapshotIdentity(
        pending.candidateSnapshotIdentity,
      ),
      expectedRemoteSnapshotIdentity:
        pending.expectedRemoteSnapshotIdentity === null
          ? null
          : cloneVaultSnapshotIdentity(pending.expectedRemoteSnapshotIdentity),
    };
  }

  async uploadTrackedSnapshot(params: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly unlockedVault: UnlockedVault;
    readonly syncAccess: SyncAccess;
    readonly snapshot: VaultSnapshot;
    readonly snapshotDigest: string;
    readonly checkpoint: LocalVaultTrustCheckpoint;
    readonly expectedRemoteSnapshotIdentity: VaultSnapshotIdentity | null;
    readonly onIntentStaged: (intent: StagedSnapshotUploadIntent) => void;
  }): Promise<SyncUploadStatus> {
    const pending = {
      candidateSnapshotIdentity: {
        descriptor: toVaultSnapshotDescriptor(params.vaultId, params.snapshot),
        snapshotDigest: params.snapshotDigest,
      },
      expectedRemoteSnapshotIdentity:
        params.expectedRemoteSnapshotIdentity === null
          ? null
          : cloneVaultSnapshotIdentity(params.expectedRemoteSnapshotIdentity),
    } satisfies PendingSnapshotUpload;
    const stagedCredentialStates = await this.runForActiveSession(
      params.sessionId,
      params.vaultId,
      "stage a snapshot upload",
      async (activeUnlockedVault) =>
        this.stagePendingSnapshotUpload(
          {
            ...params,
            unlockedVault: {
              ...params.unlockedVault,
              deviceLocalProtectionKey:
                activeUnlockedVault.deviceLocalProtectionKey,
            },
          },
          pending,
        ),
    );

    if (stagedCredentialStates.kind === "already_pending") {
      return "pending";
    }

    params.onIntentStaged(stagedCredentialStates);
    const preparedUpload = await this.syncProvider.prepareVaultSnapshotUpload(
      params.syncAccess,
      params.snapshot,
      params.expectedRemoteSnapshotIdentity,
    );
    const uploadOutcome =
      preparedUpload.status === "not_started"
        ? resolveNonStartedSyncProviderUploadOutcome(preparedUpload.outcome)
        : await this.startPreparedUpload(
            params.sessionId,
            params.vaultId,
            "start a snapshot upload",
            preparedUpload,
          );
    const syncUpload = resolveSyncProviderUploadStatus(
      params.vaultId,
      uploadOutcome,
    );

    if (syncUpload === "pending") {
      return "pending";
    }

    try {
      return (await this.runForActiveSession(
        params.sessionId,
        params.vaultId,
        "clear a completed snapshot upload",
        async () =>
          this.tryClearPendingSnapshotUpload({
            ...params,
            clearCredentialState: stagedCredentialStates.clear,
            expectedSyncCredentialState: stagedCredentialStates.pending,
          }),
      ))
        ? "complete"
        : "pending";
    } catch {
      return "pending";
    }
  }

  async retryPendingSnapshotUpload(params: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly unlockedVault: UnlockedVault;
    readonly syncAccess: SyncAccess;
    readonly snapshot: VaultSnapshot;
    readonly snapshotDigest: string;
    readonly checkpoint: LocalVaultTrustCheckpoint;
    readonly pending: PendingSnapshotUpload;
  }): Promise<SyncUploadStatus> {
    const restaged = await this.runForActiveSession(
      params.sessionId,
      params.vaultId,
      "restage a pending snapshot upload",
      async (activeUnlockedVault) =>
        this.restagePendingSnapshotUpload({
          ...params,
          unlockedVault: {
            ...params.unlockedVault,
            deviceLocalProtectionKey:
              activeUnlockedVault.deviceLocalProtectionKey,
          },
        }),
    );

    let syncUpload: SyncUploadStatus;
    try {
      const preparedUpload = await this.syncProvider.prepareVaultSnapshotUpload(
        params.syncAccess,
        params.snapshot,
        params.pending.expectedRemoteSnapshotIdentity,
      );
      const uploadOutcome =
        preparedUpload.status === "not_started"
          ? resolveNonStartedSyncProviderUploadOutcome(preparedUpload.outcome)
          : await this.startPreparedUpload(
              params.sessionId,
              params.vaultId,
              "retry a pending snapshot upload",
              preparedUpload,
            );
      syncUpload = resolveSyncProviderUploadStatus(
        params.vaultId,
        uploadOutcome,
      );
    } catch (error) {
      try {
        await this.runForActiveSession(
          params.sessionId,
          params.vaultId,
          "restore a failed pending snapshot upload",
          async () =>
            this.tryReplaceSyncCredentialState({
              ...params,
              expectedSyncCredentialState: restaged.pending,
              syncCredentialState: restaged.previous,
            }),
        );
      } catch {
        // The exact restaged intent remains recoverable after session loss.
      }
      throw error;
    }

    if (syncUpload === "pending") {
      return "pending";
    }

    try {
      return (await this.runForActiveSession(
        params.sessionId,
        params.vaultId,
        "clear a retried snapshot upload",
        async () =>
          this.tryClearPendingSnapshotUpload({
            ...params,
            clearCredentialState: restaged.clear,
            expectedSyncCredentialState: restaged.pending,
          }),
      ))
        ? "complete"
        : "pending";
    } catch {
      return "pending";
    }
  }

  async clearStagedSnapshotUploadIntent(params: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly snapshot: VaultSnapshot;
    readonly snapshotDigest: string;
    readonly checkpoint: LocalVaultTrustCheckpoint;
    readonly intent: StagedSnapshotUploadIntent;
  }): Promise<boolean> {
    try {
      return await this.runForActiveSession(
        params.sessionId,
        params.vaultId,
        "clear a failed snapshot upload",
        async () =>
          this.tryClearPendingSnapshotUpload({
            snapshot: params.snapshot,
            snapshotDigest: params.snapshotDigest,
            checkpoint: params.checkpoint,
            clearCredentialState: params.intent.clear,
            expectedSyncCredentialState: params.intent.pending,
          }),
      );
    } catch {
      return false;
    }
  }

  async removeTrackedRemoteSnapshot(params: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly syncAccess: SyncAccess;
    readonly expectedRemoteSnapshotIdentity: VaultSnapshotIdentity | null;
  }): Promise<void> {
    const preparedRemoval = await this.syncProvider.prepareVaultSnapshotRemoval(
      params.syncAccess,
      params.vaultId,
      params.expectedRemoteSnapshotIdentity,
    );

    if (preparedRemoval.status === "already_absent") {
      return;
    }

    const startedRemoval = await this.runForActiveSession(
      params.sessionId,
      params.vaultId,
      "remove the remote vault snapshot",
      async () => preparedRemoval.start(),
    );
    await startedRemoval.outcome;
  }

  async clearPendingSnapshotUpload(params: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly unlockedVault: UnlockedVault;
    readonly snapshot: VaultSnapshot;
    readonly snapshotDigest: string;
    readonly checkpoint: LocalVaultTrustCheckpoint;
    readonly pending: PendingSnapshotUpload;
  }): Promise<boolean> {
    return this.runForActiveSession(
      params.sessionId,
      params.vaultId,
      "clear a pending snapshot upload",
      async (activeUnlockedVault) => {
        const authorizedUnlockedVault = {
          ...params.unlockedVault,
          deviceLocalProtectionKey:
            activeUnlockedVault.deviceLocalProtectionKey,
        };
        const { encryptedState, state } = await this.requireSyncCredentialState(
          params.vaultId,
          authorizedUnlockedVault,
        );

        if (
          state.pendingSnapshotUpload === undefined ||
          !arePendingSnapshotUploadsEqual(
            state.pendingSnapshotUpload,
            params.pending,
          )
        ) {
          return false;
        }

        const clearCredentialState =
          await this.encryptDeviceSyncCredentialStateWithoutPending(
            params.vaultId,
            authorizedUnlockedVault,
            state,
          );

        return this.tryClearPendingSnapshotUpload({
          ...params,
          clearCredentialState,
          expectedSyncCredentialState: encryptedState,
        });
      },
    );
  }

  async prepareSyncCredentialStateWithoutPending(
    vaultId: string,
    unlockedVault: UnlockedVault,
    options: {
      /**
       * Accepts and removes an existing pending upload marker from `nextState`.
       * Use only when the caller atomically replaces the marked local snapshot.
       */
      readonly discardPendingSnapshotUpload: boolean;
      readonly requireProviderCredentialRevocationCompleteFor?: string;
    },
  ): Promise<{
    readonly expectedState: EncryptedDeviceSyncCredentialState;
    readonly nextState: EncryptedDeviceSyncCredentialState;
    readonly syncAccess: SyncAccess;
  }> {
    const providerCredentialRevocationOperation =
      options.requireProviderCredentialRevocationCompleteFor;

    if (
      providerCredentialRevocationOperation !== undefined &&
      unlockedVault.vault.providerCredentialRevocationPending !== undefined
    ) {
      throw new ProviderCredentialRevocationPendingError(
        vaultId,
        providerCredentialRevocationOperation,
      );
    }

    const { encryptedState, state, syncAccess } =
      await this.requireSyncCredentialState(vaultId, unlockedVault);

    if (
      providerCredentialRevocationOperation !== undefined &&
      state.previousCredentials !== undefined
    ) {
      throw new ProviderCredentialRevocationPendingError(
        vaultId,
        providerCredentialRevocationOperation,
      );
    }

    if (
      state.pendingSnapshotUpload !== undefined &&
      !options.discardPendingSnapshotUpload
    ) {
      throw new LocalVaultSnapshotAheadError(vaultId);
    }

    return {
      expectedState: encryptedState,
      nextState: await this.encryptDeviceSyncCredentialStateWithoutPending(
        vaultId,
        unlockedVault,
        state,
      ),
      syncAccess,
    };
  }

  private async stagePendingSnapshotUpload(
    params: {
      readonly vaultId: string;
      readonly unlockedVault: UnlockedVault;
      readonly snapshot: VaultSnapshot;
      readonly snapshotDigest: string;
      readonly checkpoint: LocalVaultTrustCheckpoint;
    },
    pending: PendingSnapshotUpload,
  ): Promise<
    | {
        readonly kind: "already_pending";
      }
    | {
        readonly kind: "staged";
        readonly clear: EncryptedDeviceSyncCredentialState;
        readonly pending: EncryptedDeviceSyncCredentialState;
      }
  > {
    if (
      pending.candidateSnapshotIdentity.descriptor.vaultId !== params.vaultId ||
      (pending.expectedRemoteSnapshotIdentity !== null &&
        pending.expectedRemoteSnapshotIdentity.descriptor.vaultId !==
          params.vaultId)
    ) {
      throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
    }

    const { encryptedState, state } = await this.requireSyncCredentialState(
      params.vaultId,
      params.unlockedVault,
    );

    if (state.pendingSnapshotUpload !== undefined) {
      if (
        arePendingSnapshotUploadsEqual(state.pendingSnapshotUpload, pending)
      ) {
        return { kind: "already_pending" };
      }

      throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
    }

    const clearCredentialState =
      await this.encryptDeviceSyncCredentialStateWithoutPending(
        params.vaultId,
        params.unlockedVault,
        state,
      );
    const markerFreeState = toSyncCredentialStateWithoutPending(state);
    const pendingCredentialState =
      await this.crypto.encryptDeviceSyncCredentialState(
        {
          ...markerFreeState,
          pendingSnapshotUpload: pending,
        },
        params.unlockedVault.deviceLocalProtectionKey,
        requireSyncCredentialEncryptionContext(
          params.vaultId,
          params.unlockedVault,
        ),
      );

    await this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
      expectedSnapshotDigest: params.snapshotDigest,
      expectedCheckpoint: params.checkpoint,
      expectedSyncCredentialState: encryptedState,
      snapshot: params.snapshot,
      checkpoint: params.checkpoint,
      syncCredentialState: pendingCredentialState,
    });

    return {
      kind: "staged",
      clear: clearCredentialState,
      pending: pendingCredentialState,
    };
  }

  private async encryptDeviceSyncCredentialStateWithoutPending(
    vaultId: string,
    unlockedVault: UnlockedVault,
    state: DeviceSyncCredentialState,
  ): Promise<EncryptedDeviceSyncCredentialState> {
    return this.crypto.encryptDeviceSyncCredentialState(
      toSyncCredentialStateWithoutPending(state),
      unlockedVault.deviceLocalProtectionKey,
      requireSyncCredentialEncryptionContext(vaultId, unlockedVault),
    );
  }

  private async restagePendingSnapshotUpload(params: {
    readonly vaultId: string;
    readonly unlockedVault: UnlockedVault;
    readonly snapshot: VaultSnapshot;
    readonly snapshotDigest: string;
    readonly checkpoint: LocalVaultTrustCheckpoint;
    readonly pending: PendingSnapshotUpload;
  }): Promise<{
    readonly previous: EncryptedDeviceSyncCredentialState;
    readonly clear: EncryptedDeviceSyncCredentialState;
    readonly pending: EncryptedDeviceSyncCredentialState;
  }> {
    const { encryptedState, state } = await this.requireSyncCredentialState(
      params.vaultId,
      params.unlockedVault,
    );

    if (
      state.pendingSnapshotUpload === undefined ||
      !arePendingSnapshotUploadsEqual(
        state.pendingSnapshotUpload,
        params.pending,
      )
    ) {
      throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
    }

    const [clearCredentialState, pendingCredentialState] = await Promise.all([
      this.encryptDeviceSyncCredentialStateWithoutPending(
        params.vaultId,
        params.unlockedVault,
        state,
      ),
      this.crypto.encryptDeviceSyncCredentialState(
        state,
        params.unlockedVault.deviceLocalProtectionKey,
        requireSyncCredentialEncryptionContext(
          params.vaultId,
          params.unlockedVault,
        ),
      ),
    ]);

    await this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
      expectedSnapshotDigest: params.snapshotDigest,
      expectedCheckpoint: params.checkpoint,
      expectedSyncCredentialState: encryptedState,
      snapshot: params.snapshot,
      checkpoint: params.checkpoint,
      syncCredentialState: pendingCredentialState,
    });

    return {
      previous: encryptedState,
      clear: clearCredentialState,
      pending: pendingCredentialState,
    };
  }

  private async tryClearPendingSnapshotUpload(params: {
    readonly snapshot: VaultSnapshot;
    readonly snapshotDigest: string;
    readonly checkpoint: LocalVaultTrustCheckpoint;
    readonly clearCredentialState: EncryptedDeviceSyncCredentialState;
    readonly expectedSyncCredentialState: EncryptedDeviceSyncCredentialState;
  }): Promise<boolean> {
    return this.tryReplaceSyncCredentialState({
      ...params,
      syncCredentialState: params.clearCredentialState,
    });
  }

  private async tryReplaceSyncCredentialState(params: {
    readonly snapshot: VaultSnapshot;
    readonly snapshotDigest: string;
    readonly checkpoint: LocalVaultTrustCheckpoint;
    readonly expectedSyncCredentialState: EncryptedDeviceSyncCredentialState;
    readonly syncCredentialState: EncryptedDeviceSyncCredentialState;
  }): Promise<boolean> {
    try {
      await this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
        expectedSnapshotDigest: params.snapshotDigest,
        expectedCheckpoint: params.checkpoint,
        expectedSyncCredentialState: params.expectedSyncCredentialState,
        snapshot: params.snapshot,
        checkpoint: params.checkpoint,
        syncCredentialState: params.syncCredentialState,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async requireSyncCredentialState(
    vaultId: string,
    unlockedVault: UnlockedVault,
  ): Promise<{
    readonly encryptedState: EncryptedDeviceSyncCredentialState;
    readonly state: DeviceSyncCredentialState;
    readonly syncAccess: SyncAccess;
  }> {
    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      throw new LocalSyncCredentialsMissingError(vaultId);
    }

    const encryptedState =
      await this.vaultLocalRepository.getDeviceSyncCredentialState(vaultId);

    if (encryptedState === null) {
      throw new LocalSyncCredentialsMissingError(vaultId);
    }

    const state = await this.crypto.decryptDeviceSyncCredentialState(
      encryptedState,
      unlockedVault.deviceLocalProtectionKey,
      {
        vaultId,
        deviceId: unlockedVault.deviceId,
        provider: syncTarget.provider,
        target: syncTarget,
      },
    );

    if (state.currentCredentials.provider !== syncTarget.provider) {
      throw new LocalSyncCredentialsMissingError(vaultId);
    }

    return {
      encryptedState,
      state,
      syncAccess: {
        target: syncTarget,
        credentials: state.currentCredentials,
      },
    };
  }

  async requireProviderCredentialRevocationComplete(
    vaultId: string,
    unlockedVault: UnlockedVault,
    operation: string,
  ): Promise<void> {
    if (unlockedVault.vault.providerCredentialRevocationPending !== undefined) {
      throw new ProviderCredentialRevocationPendingError(vaultId, operation);
    }

    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      return;
    }

    const encryptedState =
      await this.vaultLocalRepository.getDeviceSyncCredentialState(vaultId);

    if (encryptedState === null) {
      throw new LocalSyncCredentialsMissingError(vaultId);
    }

    const state = await this.crypto.decryptDeviceSyncCredentialState(
      encryptedState,
      unlockedVault.deviceLocalProtectionKey,
      {
        vaultId,
        deviceId: unlockedVault.deviceId,
        provider: syncTarget.provider,
        target: syncTarget,
      },
    );

    if (state.previousCredentials !== undefined) {
      throw new ProviderCredentialRevocationPendingError(vaultId, operation);
    }
  }

  private async runForActiveSession<T>(
    sessionId: string,
    vaultId: string,
    operation: string,
    run: (unlockedVault: UnlockedVault) => Promise<T>,
  ): Promise<T> {
    return this.unlockedVaultSession.runWithUnlockedVaultContext(
      vaultId,
      operation,
      async (session) => {
        if (session.sessionId !== sessionId) {
          throw new UnlockedVaultSessionExpiredError(vaultId);
        }

        return run(session.unlockedVault);
      },
    );
  }

  private async startPreparedUpload(
    sessionId: string,
    vaultId: string,
    operation: string,
    preparedUpload: Extract<PreparedSyncUpload, { readonly status: "ready" }>,
  ): Promise<SyncUploadOutcome> {
    let startInvoked = false;
    let startedUpload: { readonly outcome: Promise<SyncUploadOutcome> };

    try {
      startedUpload = await this.runForActiveSession(
        sessionId,
        vaultId,
        operation,
        async () => {
          startInvoked = true;
          return preparedUpload.start();
        },
      );
    } catch (error) {
      if (!startInvoked) {
        throw error;
      }

      return { status: "outcome_unknown" };
    }

    try {
      return await startedUpload.outcome;
    } catch {
      return { status: "outcome_unknown" };
    }
  }

  async uploadPersistedLocalMutation(
    vaultId: string,
    syncState: LocalMutationSyncState,
    persistedSnapshot: VaultSnapshot,
    persistedSnapshotDigest: string,
    checkpoint: LocalVaultTrustCheckpoint,
    unlockedVault: UnlockedVault,
    preparedRestore: PreparedLocalVaultSnapshotRestore,
    sessionId: string,
  ): Promise<SyncUploadStatus> {
    if (
      syncState.syncAccess === undefined ||
      syncState.remoteSnapshotIdentity === undefined
    ) {
      return "complete";
    }

    return this.uploadPersistedSnapshot({
      vaultId,
      syncAccess: syncState.syncAccess,
      persistedSnapshot,
      expectedRemoteSnapshotIdentity: syncState.remoteSnapshotIdentity,
      previousSnapshotVersionVector:
        syncState.localSnapshot.metadata.snapshotVersionVector,
      persistedSnapshotDigest,
      checkpoint,
      persistedSyncCredentialState: syncState.syncCredentialState,
      unlockedVault,
      preparedRestore,
      sessionId,
    });
  }

  async uploadPersistedInitialSyncSnapshot(
    vaultId: string,
    syncAccess: SyncAccess,
    localSnapshot: VaultSnapshot,
    persistedSnapshot: VaultSnapshot,
    persistedSnapshotDigest: string,
    checkpoint: LocalVaultTrustCheckpoint,
    persistedSyncCredentialState: EncryptedDeviceSyncCredentialState,
    unlockedVault: UnlockedVault,
    preparedRestore: PreparedLocalVaultSnapshotRestore,
    sessionId: string,
  ): Promise<SyncUploadStatus> {
    return this.uploadPersistedSnapshot({
      vaultId,
      syncAccess,
      persistedSnapshot,
      expectedRemoteSnapshotIdentity: null,
      previousSnapshotVersionVector:
        localSnapshot.metadata.snapshotVersionVector,
      persistedSnapshotDigest,
      checkpoint,
      persistedSyncCredentialState,
      unlockedVault,
      preparedRestore,
      sessionId,
    });
  }

  async uploadPersistedSnapshot(params: {
    readonly vaultId: string;
    readonly syncAccess: SyncAccess;
    readonly persistedSnapshot: VaultSnapshot;
    readonly expectedRemoteSnapshotIdentity: VaultSnapshotIdentity | null;
    readonly previousSnapshotVersionVector: VersionVector;
    readonly persistedSnapshotDigest: string;
    readonly checkpoint: LocalVaultTrustCheckpoint;
    readonly persistedSyncCredentialState: EncryptedDeviceSyncCredentialState;
    readonly unlockedVault: UnlockedVault;
    readonly preparedRestore: PreparedLocalVaultSnapshotRestore;
    readonly sessionId: string;
  }): Promise<SyncUploadStatus> {
    let expectedSyncCredentialState = params.persistedSyncCredentialState;

    try {
      return await this.uploadTrackedSnapshot({
        sessionId: params.sessionId,
        vaultId: params.vaultId,
        unlockedVault: params.unlockedVault,
        syncAccess: params.syncAccess,
        snapshot: params.persistedSnapshot,
        snapshotDigest: params.persistedSnapshotDigest,
        checkpoint: params.checkpoint,
        expectedRemoteSnapshotIdentity: params.expectedRemoteSnapshotIdentity,
        onIntentStaged: ({ pending }) => {
          expectedSyncCredentialState = pending;
        },
      });
    } catch (error) {
      const rollbackResult =
        await this.unlockedVaultSession.restorePersistedState(
          params.sessionId,
          params.vaultId,
          params.previousSnapshotVersionVector,
          async () =>
            this.vaultSnapshot.restorePreparedLocalVaultSnapshot(
              params.preparedRestore,
              params.persistedSnapshotDigest,
              params.checkpoint,
              expectedSyncCredentialState,
            ),
        );

      if (rollbackResult === "rollback_failed") {
        throw new PersistedVaultRollbackIncompleteError(params.vaultId, error);
      }

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }
  }
}

function toSyncCredentialStateWithoutPending(
  state: DeviceSyncCredentialState,
): DeviceSyncCredentialState {
  return {
    currentCredentials: state.currentCredentials,
    ...(state.previousCredentials === undefined
      ? {}
      : { previousCredentials: state.previousCredentials }),
  };
}

function requireSyncCredentialEncryptionContext(
  vaultId: string,
  unlockedVault: UnlockedVault,
) {
  const syncTarget = unlockedVault.vault.syncTarget;

  if (syncTarget === undefined) {
    throw new LocalSyncCredentialsMissingError(vaultId);
  }

  return {
    vaultId,
    deviceId: unlockedVault.deviceId,
    provider: syncTarget.provider,
    target: syncTarget,
  };
}

function arePendingSnapshotUploadsEqual(
  left: PendingSnapshotUpload,
  right: PendingSnapshotUpload,
): boolean {
  if (
    !areVaultSnapshotIdentitiesEqual(
      left.candidateSnapshotIdentity,
      right.candidateSnapshotIdentity,
    )
  ) {
    return false;
  }

  if (
    left.expectedRemoteSnapshotIdentity === null ||
    right.expectedRemoteSnapshotIdentity === null
  ) {
    return (
      left.expectedRemoteSnapshotIdentity === null &&
      right.expectedRemoteSnapshotIdentity === null
    );
  }

  return areVaultSnapshotIdentitiesEqual(
    left.expectedRemoteSnapshotIdentity,
    right.expectedRemoteSnapshotIdentity,
  );
}
