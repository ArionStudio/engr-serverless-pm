import { areJsonEqual } from "../../domain/common";
import type { DeviceTrustTransition } from "../../domain/device-trust";
import type { UnlockedVault } from "../../domain/session";
import type { SyncAccess, SyncSetupInput } from "../../domain/sync";
import { requireDeviceProfilesMatchTrust } from "../../domain/sync/device-profile-review.utils";
import {
  areVaultSnapshotDescriptorsEqual,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot";
import type { Vault } from "../../domain/vault";
import { revokeDeviceProfileFromVault } from "../../domain/vault/vault-device.mutations";
import { compareVersionVectors } from "../../domain/versioning";
import {
  CurrentDeviceRevokedError,
  InvalidDeviceRevocationTransitionError,
} from "../../errors/device-revocation.errors";
import {
  InvalidSyncConfigError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotNotFoundError,
  ReplacementSyncTargetMismatchError,
} from "../../errors/sync.errors";
import { DeviceKeySlotNotFoundError } from "../../errors/unlock-vault.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VersionVector } from "../../domain/versioning";
import type { VaultSnapshotService } from "../snapshot/vault-snapshot.service";
import { VaultTrustService } from "./vault-trust.service";

export class DeviceRevocationConsumptionService {
  private readonly crypto: CryptoPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.crypto = crypto;
    this.syncProvider = syncProvider;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async loadVerifiedCandidate(params: {
    readonly vaultId: string;
    readonly replacementSyncConfig: SyncSetupInput;
    readonly unlockedVault: UnlockedVault;
    readonly sourceSnapshotVersionVector: VersionVector;
    readonly expectedRemoteSnapshotDescriptor?: VaultSnapshotDescriptor;
  }) {
    const syncTarget = params.unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      throw new ReplacementSyncTargetMismatchError(params.vaultId);
    }

    let replacementAccess: SyncAccess;

    try {
      replacementAccess = await this.syncProvider.setup(
        params.replacementSyncConfig,
      );
    } catch (error) {
      throw new InvalidSyncConfigError(error);
    }

    if (!areJsonEqual(replacementAccess.target, syncTarget)) {
      throw new ReplacementSyncTargetMismatchError(params.vaultId);
    }

    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        params.unlockedVault,
        params.sourceSnapshotVersionVector,
      );
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        replacementAccess,
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
      replacementAccess,
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
      throw new InvalidDeviceRevocationTransitionError(
        params.vaultId,
        "snapshot is not a direct descendant of the local vault",
      );
    }

    const transitions = await this.vaultTrust.verifyDeviceTrustSuffix(
      params.vaultId,
      remoteTrust.chain,
      params.unlockedVault.trustedSnapshotContext.trust,
      remoteTrust.state,
    );
    const revocations = transitions.filter(
      (transition) => transition.type === "revocation",
    );
    const enrollments = transitions.filter(
      (transition) => transition.type === "enrollment",
    );

    if (revocations.length === 0) {
      throw new InvalidDeviceRevocationTransitionError(
        params.vaultId,
        "the trust suffix contains no device revocation",
      );
    }

    const finalLocalIdentity = remoteTrust.state.trustedDevices.find(
      (device) => device.deviceId === params.unlockedVault.deviceId,
    );

    if (finalLocalIdentity === undefined) {
      throw new CurrentDeviceRevokedError(
        params.vaultId,
        params.unlockedVault.deviceId,
      );
    }

    const localDeviceSlot = remoteSnapshot.keySlots.deviceSlots.find(
      (slot) => slot.deviceId === params.unlockedVault.deviceId,
    );

    if (localDeviceSlot === undefined) {
      throw new DeviceKeySlotNotFoundError(
        params.vaultId,
        params.unlockedVault.deviceId,
      );
    }

    const vaultMasterKey = await this.crypto.openDeviceVaultKeyEnvelope(
      localDeviceSlot.envelope,
      params.unlockedVault.devicePrivateVaultKey,
      {
        vaultId: params.vaultId,
        deviceId: params.unlockedVault.deviceId,
        vaultKeyGeneration: remoteSnapshot.metadata.vaultKeyGeneration,
        algorithmSuiteId: remoteSnapshot.metadata.algorithmSuiteId,
      },
    );
    const remoteVault = await this.crypto.decryptVaultSnapshotContent(
      remoteSnapshot.content,
      vaultMasterKey,
    );

    if (
      !areJsonEqual(remoteVault.syncTarget, syncTarget) ||
      remoteVault.syncRemovalPending !==
        params.unlockedVault.vault.syncRemovalPending
    ) {
      throw new InvalidDeviceRevocationTransitionError(
        params.vaultId,
        "the revocation snapshot changed the sync target or removal state",
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
      throw new InvalidDeviceRevocationTransitionError(
        params.vaultId,
        "device profiles do not match the trusted identities",
        { cause: error },
      );
    }

    const trustTransitionBaseline = this.buildTrustTransitionBaseline(
      params.vaultId,
      params.unlockedVault.vault,
      remoteVault,
      transitions,
      new Set(
        remoteTrust.state.trustedDevices.map((device) => device.deviceId),
      ),
      new Set(
        params.unlockedVault.trustedSnapshotContext.trust.trustedDevices.map(
          (device) => device.deviceId,
        ),
      ),
    );

    return {
      replacementAccess,
      localSnapshot,
      remoteSnapshotDescriptor,
      remoteSnapshot,
      remoteTrust,
      transitions,
      revocations,
      enrollments,
      remoteVault,
      trustTransitionBaseline,
      vaultMasterKey,
    };
  }

  private buildTrustTransitionBaseline(
    vaultId: string,
    localVault: Vault,
    remoteVault: Vault,
    transitions: readonly DeviceTrustTransition[],
    finalTrustedDeviceIds: ReadonlySet<string>,
    initialTrustedDeviceIds: ReadonlySet<string>,
  ): Vault {
    let baseline = localVault;
    const revokedDeviceIds = new Set<string>();

    for (const transition of transitions) {
      if (transition.type === "enrollment") {
        const enrolledDeviceId = transition.enrolledDeviceId;
        const localProfile = baseline.deviceProfiles.find(
          (profile) => profile.id === enrolledDeviceId,
        );
        const localTombstone = baseline.deletedDeviceProfiles.find(
          (profile) => profile.id === enrolledDeviceId,
        );
        const remoteProfiles = remoteVault.deviceProfiles.filter(
          (profile) => profile.id === enrolledDeviceId,
        );
        const remoteTombstones = remoteVault.deletedDeviceProfiles.filter(
          (profile) => profile.id === enrolledDeviceId,
        );

        if (
          localProfile !== undefined ||
          localTombstone !== undefined ||
          remoteProfiles.length > 1 ||
          remoteTombstones.length > 1
        ) {
          throw new InvalidDeviceRevocationTransitionError(
            vaultId,
            "an enrolled identity has inconsistent device-profile state",
          );
        }

        if (finalTrustedDeviceIds.has(enrolledDeviceId)) {
          if (remoteTombstones.length !== 0) {
            throw new InvalidDeviceRevocationTransitionError(
              vaultId,
              "a trusted enrolled identity has a deleted profile",
            );
          }

          const remoteProfile = remoteProfiles[0];

          if (remoteProfile !== undefined) {
            baseline = {
              ...baseline,
              deviceProfiles: [...baseline.deviceProfiles, remoteProfile],
            };
          }
        } else if (remoteProfiles.length !== 0) {
          throw new InvalidDeviceRevocationTransitionError(
            vaultId,
            "a revoked enrolled identity remains active",
          );
        }

        continue;
      }

      if (revokedDeviceIds.has(transition.revokedDeviceId)) {
        throw new InvalidDeviceRevocationTransitionError(
          vaultId,
          "the same device is revoked more than once",
        );
      }

      revokedDeviceIds.add(transition.revokedDeviceId);

      if (
        remoteVault.deviceProfiles.some(
          (profile) => profile.id === transition.revokedDeviceId,
        )
      ) {
        throw new InvalidDeviceRevocationTransitionError(
          vaultId,
          "a revoked device profile remains active",
        );
      }

      const localProfiles = baseline.deviceProfiles.filter(
        (profile) => profile.id === transition.revokedDeviceId,
      );
      const localTombstone = baseline.deletedDeviceProfiles.find(
        (profile) => profile.id === transition.revokedDeviceId,
      );
      const remoteTombstones = remoteVault.deletedDeviceProfiles.filter(
        (profile) => profile.id === transition.revokedDeviceId,
      );

      if (localProfiles.length > 1) {
        throw new InvalidDeviceRevocationTransitionError(
          vaultId,
          "a revoked device has duplicate active profiles",
        );
      }

      const localProfile = localProfiles[0];

      if (localProfile === undefined) {
        if (localTombstone !== undefined || remoteTombstones.length > 1) {
          throw new InvalidDeviceRevocationTransitionError(
            vaultId,
            "a pending revoked identity has inconsistent profile state",
          );
        }

        const remoteTombstone = remoteTombstones[0];

        if (remoteTombstone !== undefined) {
          if (initialTrustedDeviceIds.has(transition.revokedDeviceId)) {
            throw new InvalidDeviceRevocationTransitionError(
              vaultId,
              "a locally pending revoked identity has a profile tombstone",
            );
          }

          baseline = {
            ...baseline,
            deletedDeviceProfiles: [
              ...baseline.deletedDeviceProfiles,
              remoteTombstone,
            ],
          };
        }

        continue;
      }

      const remoteTombstone = remoteTombstones[0];

      if (
        localTombstone !== undefined ||
        remoteTombstones.length !== 1 ||
        remoteTombstone === undefined
      ) {
        throw new InvalidDeviceRevocationTransitionError(
          vaultId,
          "a revoked device profile is missing its tombstone",
        );
      }

      baseline = revokeDeviceProfileFromVault(
        baseline,
        transition.authorizedByDeviceId,
        transition.revokedDeviceId,
        remoteTombstone.deletedAt,
      );
      const baselineTombstone = baseline.deletedDeviceProfiles.find(
        (profile) => profile.id === transition.revokedDeviceId,
      );

      if (!areJsonEqual(baselineTombstone, remoteTombstone)) {
        throw new InvalidDeviceRevocationTransitionError(
          vaultId,
          "a revoked device tombstone does not match its trust transition",
        );
      }
    }

    return baseline;
  }
}
