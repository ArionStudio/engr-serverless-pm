import { areJsonEqual } from "../../domain/common";
import type {
  SyncAccess,
  SyncSetupInput,
} from "../../domain/sync/sync-config.type";
import {
  InvalidSyncConfigError,
  LocalSyncCredentialsMissingError,
  ProviderCredentialRevocationPendingError,
  ReplacementSyncTargetMismatchError,
  SyncCredentialsRejectedError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { requireSyncProviderAccessOutcome } from "../../services/sync/sync-provider-outcome.policy";

export type UpdateSyncCredentialsCommandParams = {
  readonly vaultId: string;
  readonly syncConfig: SyncSetupInput;
};

export class UpdateSyncCredentialsUseCase {
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

  async execute(params: UpdateSyncCredentialsCommandParams): Promise<void> {
    const vaultId = params.vaultId;
    let syncConfig: SyncSetupInput;
    try {
      syncConfig = JSON.parse(
        JSON.stringify(params.syncConfig),
      ) as SyncSetupInput;
    } catch {
      throw new InvalidSyncConfigError();
    }
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        vaultId,
        "update sync credentials",
      );
    const target = unlockedVault.vault.syncTarget;
    if (target === undefined) {
      throw new SyncNotConfiguredError(vaultId, "update sync credentials");
    }

    let access: SyncAccess;
    try {
      access = await this.syncProvider.setup(syncConfig);
    } catch {
      throw new InvalidSyncConfigError();
    }
    if (
      !areJsonEqual(access.target, target) ||
      access.credentials.provider !== target.provider
    ) {
      throw new ReplacementSyncTargetMismatchError(vaultId);
    }
    // The provider's read probe does not establish write permission. Network
    // work stays outside the session lease so a slow request cannot defer lock.
    const outcome = requireSyncProviderAccessOutcome(
      await this.syncProvider.checkVaultAccess(access, vaultId),
    );
    if (outcome === "authentication_rejected") {
      throw new SyncCredentialsRejectedError();
    }

    await this.unlockedVaultSession.persistForActiveSession(
      sessionId,
      vaultId,
      async () => {
        const snapshot =
          await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
            vaultId,
            unlockedVault,
            sourceSnapshotVersionVector,
          );
        const checkpoint =
          await this.vaultSnapshot.requireCurrentCheckpointForUnlockedVault(
            vaultId,
            snapshot,
            unlockedVault,
          );
        const encryptedState =
          await this.vaultLocalRepository.getDeviceSyncCredentialState(vaultId);
        if (encryptedState === null) {
          throw new LocalSyncCredentialsMissingError(vaultId);
        }
        const context = {
          vaultId,
          deviceId: unlockedVault.deviceId,
          provider: target.provider,
          target,
        };
        const state = await this.crypto.decryptDeviceSyncCredentialState(
          encryptedState,
          unlockedVault.deviceLocalProtectionKey,
          context,
        );
        if (
          state.previousCredentials !== undefined &&
          areJsonEqual(
            state.previousCredentials.credentials,
            access.credentials,
          )
        ) {
          throw new ProviderCredentialRevocationPendingError(
            vaultId,
            "reuse previous credentials",
          );
        }
        const updatedState = await this.crypto.encryptDeviceSyncCredentialState(
          { ...state, currentCredentials: access.credentials },
          unlockedVault.deviceLocalProtectionKey,
          context,
        );
        await this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
          expectedSnapshotDigest:
            unlockedVault.trustedSnapshotContext.snapshotDigest,
          expectedCheckpoint: checkpoint,
          expectedSyncCredentialState: encryptedState,
          snapshot,
          checkpoint,
          syncCredentialState: updatedState,
        });
      },
    );
  }
}
