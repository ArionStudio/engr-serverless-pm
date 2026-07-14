import type { Vault } from "../../domain/vault/vault";
import { revokeDeviceProfileFromVault } from "../../domain/vault/vault-device.mutations";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import {
  CannotRevokeCurrentDeviceError,
  DeviceProfileNotFoundForRevocationError,
  DeviceToRevokeNotTrustedError,
} from "./revoke-device.errors";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { VaultSyncGuardService } from "../../services/sync";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";

export type RevokeDeviceCommandParams = {
  readonly vaultId: string;
  readonly deviceId: string;
};

export type RevokeDeviceResult = {
  readonly vault: Vault;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
};

export class RevokeDeviceUseCase {
  private readonly clock: ClockPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.clock = clock;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async execute(
    params: RevokeDeviceCommandParams,
  ): Promise<RevokeDeviceResult> {
    // Revoke can only be performed by the currently unlocked vault, and a
    // device cannot revoke the local identity it is actively using.
    const { sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "revoke device",
      );

    if (params.deviceId === unlockedVault.deviceId) {
      throw new CannotRevokeCurrentDeviceError(params.vaultId, params.deviceId);
    }

    // Start from the current local snapshot and verify its provenance before
    // using its trust and key-slot state as the basis for the new snapshot.
    const syncState = await this.vaultSyncGuard.prepareLocalMutation(
      params.vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );
    const currentVaultSnapshot = syncState.localSnapshot;

    // The target must exist in the device access surface we are about to remove it from.
    const isRevokedDeviceTrusted =
      currentVaultSnapshot.keySlots.deviceSlots.some(
        (deviceSlot) => deviceSlot.deviceId === params.deviceId,
      );

    if (!isRevokedDeviceTrusted) {
      throw new DeviceToRevokeNotTrustedError(params.vaultId, params.deviceId);
    }

    if (
      !unlockedVault.vault.deviceProfiles.some(
        (deviceProfile) => deviceProfile.id === params.deviceId,
      )
    ) {
      throw new DeviceProfileNotFoundForRevocationError(
        params.vaultId,
        params.deviceId,
      );
    }

    // Tombstone the revoked device profile inside encrypted vault content.
    // Snapshot trust/key-slot changes are handled separately below because
    // they live outside the encrypted content.
    const revisionTimestamp = this.clock.now();
    const revokedVault = revokeDeviceProfileFromVault(
      unlockedVault.vault,
      unlockedVault.deviceId,
      params.deviceId,
      revisionTimestamp,
    );
    const enrollmentKeySlot = currentVaultSnapshot.keySlots.enrollmentKeySlot;
    const retainedEnrollmentKeySlot =
      enrollmentKeySlot?.authorizedByDeviceId === params.deviceId
        ? undefined
        : enrollmentKeySlot;
    const currentTrustChain = currentVaultSnapshot.trustChain;

    if (currentTrustChain === undefined) {
      throw new VaultTrustStateInvalidError(
        params.vaultId,
        "trust chain is missing",
      );
    }

    const nextTrust = await this.vaultTrust.appendTrustTransition(
      params.vaultId,
      currentTrustChain,
      unlockedVault.trustedSnapshotContext.trust,
      unlockedVault.trustedSnapshotContext.trust.trustedDevices.filter(
        (device) => device.deviceId !== params.deviceId,
      ),
      unlockedVault.deviceId,
      unlockedVault.devicePrivateSignKey,
    );

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: revokedVault,
    };
    const persistedSnapshot = await this.vaultSnapshot.persistUnlockedVault(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotVersionVector,
      {
        keySlots: {
          deviceSlots: currentVaultSnapshot.keySlots.deviceSlots.filter(
            (deviceSlot) => deviceSlot.deviceId !== params.deviceId,
          ),
          ...(retainedEnrollmentKeySlot === undefined
            ? {}
            : { enrollmentKeySlot: retainedEnrollmentKeySlot }),
          completedEnrollments:
            currentVaultSnapshot.keySlots.completedEnrollments,
        },
        nextTrust: {
          chain: nextTrust.chain,
          state: nextTrust.trust,
        },
      },
    );
    const persistedUnlockedVault = {
      ...updatedUnlockedVault,
      trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
    };

    await this.vaultSyncGuard.uploadPersistedLocalMutation(
      params.vaultId,
      syncState,
      persistedSnapshot.snapshot,
      unlockedVault,
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      persistedUnlockedVault,
      persistedSnapshot.snapshotVersionVector,
    );

    return {
      vault: revokedVault,
      snapshotVersionVector: persistedSnapshot.snapshotVersionVector,
      revisionTimestamp: persistedSnapshot.revisionTimestamp,
    };
  }
}
