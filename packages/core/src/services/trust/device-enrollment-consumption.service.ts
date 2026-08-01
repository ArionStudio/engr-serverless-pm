import { areJsonEqual } from "../../domain/common";
import type { DeviceEnrollmentTransition } from "../../domain/device-trust";
import type { UnlockedVault } from "../../domain/session";
import { requireDeviceProfilesMatchTrust } from "../../domain/sync/device-profile-review.utils";
import { findChangesInKeySlots } from "../../domain/sync/key-slot-review.utils";
import {
  areVaultSnapshotDescriptorsEqual,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot";
import type { Vault } from "../../domain/vault";
import { clearVaultProviderCredentialRevocationPending } from "../../domain/vault/vault-sync-config.mutations";
import type { VersionVector } from "../../domain/versioning";
import { compareVersionVectors } from "../../domain/versioning";
import { InvalidDeviceEnrollmentTransitionError } from "../../errors/device-enrollment.errors";
import {
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotNotFoundError,
  SyncNotConfiguredError,
  SyncRemovalPendingError,
} from "../../errors/sync.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultSnapshotService } from "../snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../sync";
import { VaultTrustService } from "./vault-trust.service";

export class DeviceEnrollmentConsumptionService {
  private readonly syncProvider: SyncProviderPort;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    vaultSnapshot: VaultSnapshotService,
    vaultSyncGuard: VaultSyncGuardService,
  ) {
    this.syncProvider = syncProvider;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async loadVerifiedCandidate(params: {
    readonly vaultId: string;
    readonly operation: string;
    readonly unlockedVault: UnlockedVault;
    readonly sourceSnapshotVersionVector: VersionVector;
    readonly expectedRemoteSnapshotDescriptor?: VaultSnapshotDescriptor;
  }) {
    if (params.unlockedVault.vault.syncTarget === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, params.operation);
    }

    if (params.unlockedVault.vault.syncRemovalPending !== undefined) {
      throw new SyncRemovalPendingError(params.vaultId, params.operation);
    }

    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        params.unlockedVault,
        params.sourceSnapshotVersionVector,
      );
    const syncAccess = await this.vaultSyncGuard.requireSyncAccess(
      params.vaultId,
      params.unlockedVault,
    );
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncAccess,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor === null) {
      throw new RemoteVaultSnapshotNotFoundError(params.vaultId);
    }

    if (
      params.expectedRemoteSnapshotDescriptor !== undefined &&
      !areVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        params.expectedRemoteSnapshotDescriptor,
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    const remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
      syncAccess,
      remoteSnapshotDescriptor,
    );

    if (
      !areVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        toVaultSnapshotDescriptor(params.vaultId, remoteSnapshot),
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    const remoteTrust = await this.vaultSnapshot.verifyCandidateSnapshotTrust(
      params.vaultId,
      remoteSnapshot,
      params.unlockedVault,
    );

    if (
      remoteSnapshot.metadata.vaultCreationTimestamp !==
        localSnapshot.metadata.vaultCreationTimestamp ||
      compareVersionVectors(
        localSnapshot.metadata.snapshotVersionVector,
        remoteSnapshot.metadata.snapshotVersionVector,
      ) !== "remote_ahead"
    ) {
      throw new InvalidDeviceEnrollmentTransitionError(
        params.vaultId,
        "snapshot is not causally ahead of the local vault",
      );
    }

    const transitions = await this.vaultTrust.verifyDeviceEnrollmentSuffix(
      params.vaultId,
      remoteTrust.chain,
      params.unlockedVault.trustedSnapshotContext.trust,
      remoteTrust.state,
    );
    let keySlotChanges;

    try {
      keySlotChanges = findChangesInKeySlots(
        localSnapshot.keySlots,
        remoteSnapshot.keySlots,
      );
    } catch (error) {
      throw new InvalidDeviceEnrollmentTransitionError(
        params.vaultId,
        "an existing device vault-key envelope changed",
        { cause: error },
      );
    }

    const enrolledDeviceIds = transitions.map(
      (transition) => transition.enrolledDeviceId,
    );

    if (
      keySlotChanges.deviceSlots.removedDeviceIds.length !== 0 ||
      !areJsonEqual(
        [...keySlotChanges.deviceSlots.addedDeviceIds].sort(),
        [...enrolledDeviceIds].sort(),
      ) ||
      remoteSnapshot.metadata.vaultKeyGeneration !==
        localSnapshot.metadata.vaultKeyGeneration
    ) {
      throw new InvalidDeviceEnrollmentTransitionError(
        params.vaultId,
        "device slots do not match the enrollment transitions",
      );
    }

    const remoteVault = await this.vaultSnapshot.openTrustedVaultSnapshot(
      params.vaultId,
      remoteSnapshot,
      params.unlockedVault.vaultMasterKey,
    );
    const providerCredentialRevocationCompleted =
      params.unlockedVault.vault.providerCredentialRevocationPending !==
        undefined &&
      remoteVault.providerCredentialRevocationPending === undefined;

    if (
      !areJsonEqual(
        remoteVault.syncTarget,
        params.unlockedVault.vault.syncTarget,
      ) ||
      !areJsonEqual(
        remoteVault.syncRemovalPending,
        params.unlockedVault.vault.syncRemovalPending,
      ) ||
      (!areJsonEqual(
        remoteVault.providerCredentialRevocationPending,
        params.unlockedVault.vault.providerCredentialRevocationPending,
      ) &&
        !providerCredentialRevocationCompleted)
    ) {
      throw new InvalidDeviceEnrollmentTransitionError(
        params.vaultId,
        "the enrollment snapshot changed protected sync state",
      );
    }

    try {
      requireDeviceProfilesMatchTrust(
        params.unlockedVault.vault,
        new Set(
          params.unlockedVault.trustedSnapshotContext.trust.trustedDevices.map(
            (device) => device.deviceId,
          ),
        ),
        new Set(
          localSnapshot.trustChain.certificates.flatMap((certificate) =>
            certificate.payload.trustedDevices.map((device) => device.deviceId),
          ),
        ),
      );
      requireDeviceProfilesMatchTrust(
        remoteVault,
        new Set(
          remoteTrust.state.trustedDevices.map((device) => device.deviceId),
        ),
        new Set(
          remoteTrust.chain.certificates.flatMap((certificate) =>
            certificate.payload.trustedDevices.map((device) => device.deviceId),
          ),
        ),
      );
    } catch (error) {
      throw new InvalidDeviceEnrollmentTransitionError(
        params.vaultId,
        "device profiles do not match the trusted identities",
        { cause: error },
      );
    }

    const enrollmentBaselineWithLocalProviderState =
      this.buildEnrollmentBaseline(
        params.vaultId,
        params.unlockedVault.vault,
        remoteVault,
        transitions,
      );
    const enrollmentBaseline = providerCredentialRevocationCompleted
      ? clearVaultProviderCredentialRevocationPending(
          enrollmentBaselineWithLocalProviderState,
        )
      : enrollmentBaselineWithLocalProviderState;

    return {
      localSnapshot,
      remoteSnapshotDescriptor,
      remoteSnapshot,
      remoteTrust,
      transitions,
      remoteVault,
      enrollmentBaseline,
      syncAccess,
    };
  }

  private buildEnrollmentBaseline(
    vaultId: string,
    localVault: Vault,
    remoteVault: Vault,
    transitions: readonly DeviceEnrollmentTransition[],
  ): Vault {
    let baseline = localVault;

    for (const transition of transitions) {
      const enrolledDeviceId = transition.enrolledDeviceId;
      const localProfiles = localVault.deviceProfiles.filter(
        (profile) => profile.id === enrolledDeviceId,
      );
      const localTombstones = localVault.deletedDeviceProfiles.filter(
        (profile) => profile.id === enrolledDeviceId,
      );
      const remoteProfiles = remoteVault.deviceProfiles.filter(
        (profile) => profile.id === enrolledDeviceId,
      );
      const remoteTombstones = remoteVault.deletedDeviceProfiles.filter(
        (profile) => profile.id === enrolledDeviceId,
      );

      if (
        localProfiles.length !== 0 ||
        localTombstones.length !== 0 ||
        remoteProfiles.length > 1 ||
        remoteTombstones.length !== 0
      ) {
        throw new InvalidDeviceEnrollmentTransitionError(
          vaultId,
          "an enrolled identity has inconsistent device-profile state",
        );
      }

      const remoteProfile = remoteProfiles[0];

      if (remoteProfile !== undefined) {
        baseline = {
          ...baseline,
          deviceProfiles: [...baseline.deviceProfiles, remoteProfile],
        };
      }
    }

    return baseline;
  }
}
