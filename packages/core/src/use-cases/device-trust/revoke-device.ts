import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { Vault } from "../../domain/vault/vault";
import { revokeDeviceProfileFromVault } from "../../domain/vault/vault-device.mutations";
import {
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../errors/unlock-vault.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import {
  CannotRevokeCurrentDeviceError,
  DeviceProfileNotFoundForRevocationError,
  DeviceToRevokeNotTrustedError,
} from "./revoke-device.errors";
import { incrementVersionVector } from "../../domain/versioning/version-vector.utils";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { VaultSyncGuardService } from "../../services/sync";

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
  private readonly crypto: CryptoPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultLocalRepository = vaultLocalRepository;
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

    const signerDevice = currentVaultSnapshot.keySlots.deviceSlots.find(
      (deviceSlot) =>
        deviceSlot.deviceId === currentVaultSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        params.vaultId,
        currentVaultSnapshot.metadata.createdByDeviceId,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      currentVaultSnapshot,
      signerDevice.publicSignKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(params.vaultId);
    }

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

    // Rebuild the snapshot device access state without the revoked device and sign the
    // result as the still-trusted local device.
    const unsignedVaultSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        ...currentVaultSnapshot.metadata,
        id: params.vaultId,
        revisionTimestamp,
        snapshotVersionVector: incrementVersionVector(
          currentVaultSnapshot.metadata.snapshotVersionVector,
          unlockedVault.deviceId,
        ),
        createdByDeviceId: unlockedVault.deviceId,
      },
      keySlots: {
        deviceSlots: currentVaultSnapshot.keySlots.deviceSlots.filter(
          (deviceSlot) => deviceSlot.deviceId !== params.deviceId,
        ),
        recoveryKeySlot: currentVaultSnapshot.keySlots.recoveryKeySlot,
        completedEnrollments:
          currentVaultSnapshot.keySlots.completedEnrollments,
      },
      content: await this.crypto.encryptVaultSnapshotContent(
        revokedVault,
        unlockedVault.vaultMasterKey,
      ),
    };

    const revokedVaultSnapshot: VaultSnapshot = {
      ...unsignedVaultSnapshot,
      signature: await this.crypto.signVaultSnapshot(
        unsignedVaultSnapshot,
        unlockedVault.devicePrivateSignKey,
      ),
    };

    // Persist the revoked snapshot before advancing the unlocked session to
    // the matching snapshot version vector.
    await this.vaultLocalRepository.saveVaultSnapshot(revokedVaultSnapshot);

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: revokedVault,
    };

    await this.vaultSyncGuard.uploadPersistedLocalMutation(
      params.vaultId,
      syncState,
      revokedVaultSnapshot,
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      revokedVaultSnapshot.metadata.snapshotVersionVector,
    );

    return {
      vault: revokedVault,
      snapshotVersionVector:
        revokedVaultSnapshot.metadata.snapshotVersionVector,
      revisionTimestamp: revokedVaultSnapshot.metadata.revisionTimestamp,
    };
  }
}
