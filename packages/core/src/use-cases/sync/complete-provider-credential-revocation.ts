import {
  LocalSyncCredentialsMissingError,
  PreviousSyncCredentialStillActiveError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import { InvalidDeviceRevocationTransitionError } from "../../errors/device-revocation.errors";
import { LocalVaultTrustCheckpointNotFoundError } from "../../errors/vault-trust.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";

export type CompleteProviderCredentialRevocationCommandParams = {
  readonly vaultId: string;
};

export class CompleteProviderCredentialRevocationUseCase {
  private readonly crypto: CryptoPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.crypto = crypto;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultLocalRepository = vaultLocalRepository;
  }

  async execute(
    params: CompleteProviderCredentialRevocationCommandParams,
  ): Promise<{ readonly providerCredentialRevocation: "complete" }> {
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "complete provider credential revocation",
      );
    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      throw new SyncNotConfiguredError(
        params.vaultId,
        "complete provider credential revocation",
      );
    }

    const encryptedState =
      await this.vaultLocalRepository.getDeviceSyncCredentialState(
        params.vaultId,
      );

    if (encryptedState === null) {
      throw new LocalSyncCredentialsMissingError(params.vaultId);
    }

    const context = {
      vaultId: params.vaultId,
      deviceId: unlockedVault.deviceId,
      provider: syncTarget.provider,
      target: syncTarget,
    } as const;
    const state = await this.crypto.decryptDeviceSyncCredentialState(
      encryptedState,
      unlockedVault.deviceLocalProtectionKey,
      context,
    );

    if (state.previousCredentials === undefined) {
      return { providerCredentialRevocation: "complete" };
    }

    const snapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );

    if (
      state.previousCredentials.vaultKeyGeneration !==
      snapshot.metadata.vaultKeyGeneration
    ) {
      throw new InvalidDeviceRevocationTransitionError(
        params.vaultId,
        "pending provider credential generation does not match the snapshot",
      );
    }

    const access = {
      target: syncTarget,
      credentials: state.previousCredentials.credentials,
    };
    const result = await this.syncProvider.checkVaultAccess(
      access,
      params.vaultId,
    );

    if (result === "accessible") {
      throw new PreviousSyncCredentialStillActiveError(params.vaultId);
    }

    const completedState = await this.crypto.encryptDeviceSyncCredentialState(
      { currentCredentials: state.currentCredentials },
      unlockedVault.deviceLocalProtectionKey,
      context,
    );
    const checkpoint =
      await this.vaultLocalRepository.getLocalVaultTrustCheckpoint(
        params.vaultId,
      );

    if (checkpoint === null) {
      throw new LocalVaultTrustCheckpointNotFoundError(params.vaultId);
    }

    await this.unlockedVaultSession.persistForActiveSession(
      sessionId,
      params.vaultId,
      async () =>
        this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
          expectedSnapshotDigest:
            unlockedVault.trustedSnapshotContext.snapshotDigest,
          snapshot,
          checkpoint,
          syncCredentialState: completedState,
        }),
    );

    return { providerCredentialRevocation: "complete" };
  }
}
