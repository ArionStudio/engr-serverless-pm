import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import {
  areVaultSnapshotDescriptorsEqual,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import {
  markVaultSyncRemovalPending,
  removeVaultSyncTarget,
} from "../../domain/vault/vault-sync-config.mutations";
import { removeOtherDeviceProfilesFromVault } from "../../domain/vault/vault-device.mutations";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotIntegrityError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultSyncGuardService } from "../../services/sync";

export type DisableSyncCommandParams = {
  readonly vaultId: string;
};

export class DisableSyncUseCase {
  private readonly clock: ClockPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultTrust: VaultTrustService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly crypto: CryptoPort;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultSyncGuard: VaultSyncGuardService,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultTrust = new VaultTrustService(crypto);
    this.vaultSyncGuard = vaultSyncGuard;
  }

  async execute(params: DisableSyncCommandParams): Promise<void> {
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "disable sync",
      );
    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "disable sync");
    }

    await this.vaultSyncGuard.requireProviderCredentialRevocationComplete(
      params.vaultId,
      unlockedVault,
      "disable sync",
    );
    const syncAccess = await this.vaultSyncGuard.requireSyncAccess(
      params.vaultId,
      unlockedVault,
    );
    let currentUnlockedVault = unlockedVault;
    let currentSnapshotVersionVector = sourceSnapshotVersionVector;
    let currentSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        currentUnlockedVault,
        currentSnapshotVersionVector,
      );

    if (currentUnlockedVault.vault.syncRemovalPending !== true) {
      const remoteSnapshotDescriptor =
        await this.syncProvider.getLatestVaultSnapshotDescriptor(
          syncAccess,
          params.vaultId,
        );

      if (remoteSnapshotDescriptor !== null) {
        const localSnapshotDescriptor = toVaultSnapshotDescriptor(
          params.vaultId,
          currentSnapshot,
        );
        const relation = compareVaultSnapshotDescriptors(
          localSnapshotDescriptor,
          remoteSnapshotDescriptor,
        );

        if (relation === "remote_ahead") {
          throw new RemoteVaultSnapshotAheadError(params.vaultId);
        }

        if (
          relation === "broken" ||
          (relation === "equal" &&
            !areVaultSnapshotDescriptorsEqual(
              remoteSnapshotDescriptor,
              localSnapshotDescriptor,
            ))
        ) {
          throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
        }
      }

      const pendingUnlockedVault = {
        ...unlockedVault,
        vault: markVaultSyncRemovalPending(unlockedVault.vault),
      };
      const pendingSnapshot =
        await this.unlockedVaultSession.persistForActiveSession(
          sessionId,
          params.vaultId,
          async () =>
            this.vaultSnapshot.persistUnlockedVault(
              params.vaultId,
              pendingUnlockedVault,
              sourceSnapshotVersionVector,
            ),
        );

      currentUnlockedVault = {
        ...pendingUnlockedVault,
        trustedSnapshotContext: pendingSnapshot.trustedSnapshotContext,
      };
      currentSnapshotVersionVector = pendingSnapshot.snapshotVersionVector;
      currentSnapshot = pendingSnapshot.snapshot;

      await this.unlockedVaultSession.commitPersistedSnapshot(
        sessionId,
        currentUnlockedVault,
        currentSnapshotVersionVector,
      );
    }

    await this.syncProvider.removeVaultSnapshots(syncAccess, params.vaultId);

    const revisionTimestamp = this.clock.now();
    const updatedVault = removeVaultSyncTarget(
      removeOtherDeviceProfilesFromVault(
        currentUnlockedVault.vault,
        currentUnlockedVault.deviceId,
        revisionTimestamp,
      ),
    );
    const currentTrust = currentUnlockedVault.trustedSnapshotContext.trust;
    const survivingIdentities = currentTrust.trustedDevices.filter(
      (device) => device.deviceId === currentUnlockedVault.deviceId,
    );
    const revokesOtherDevices =
      survivingIdentities.length !== currentTrust.trustedDevices.length;
    const vaultKeyGeneration = revokesOtherDevices
      ? currentSnapshot.metadata.vaultKeyGeneration + 1
      : currentSnapshot.metadata.vaultKeyGeneration;
    const nextTrust = revokesOtherDevices
      ? await this.vaultTrust.appendTrustTransition(
          params.vaultId,
          currentSnapshot.trustChain,
          currentTrust,
          survivingIdentities,
          vaultKeyGeneration,
          currentUnlockedVault.deviceId,
          currentUnlockedVault.devicePrivateSignKey,
        )
      : {
          chain: currentSnapshot.trustChain,
          trust: currentTrust,
        };
    const currentIdentity = survivingIdentities[0];

    if (currentIdentity === undefined) {
      throw new VaultTrustStateInvalidError(
        params.vaultId,
        "current device is not trusted",
      );
    }

    const vaultMasterKey = revokesOtherDevices
      ? await this.crypto.generateVaultMasterKey()
      : currentUnlockedVault.vaultMasterKey;
    const deviceSlots = revokesOtherDevices
      ? [
          {
            deviceId: currentUnlockedVault.deviceId,
            vaultKeyGeneration,
            envelope: await this.crypto.createDeviceVaultKeyEnvelope(
              vaultMasterKey,
              currentIdentity.publicVaultKey,
              {
                vaultId: params.vaultId,
                deviceId: currentUnlockedVault.deviceId,
                vaultKeyGeneration,
                algorithmSuiteId: this.crypto.algorithmSuite.id,
              },
            ),
          },
        ]
      : currentSnapshot.keySlots.deviceSlots;
    const updatedUnlockedVault = {
      ...currentUnlockedVault,
      vault: updatedVault,
      vaultMasterKey,
    };

    const persistedSnapshot =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.persistUnlockedVault(
            params.vaultId,
            updatedUnlockedVault,
            currentSnapshotVersionVector,
            {
              vaultKeyGeneration,
              keySlots: {
                deviceSlots,
              },
              nextTrust: {
                chain: nextTrust.chain,
                state: nextTrust.trust,
              },
              syncCredentialState: null,
            },
          ),
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
