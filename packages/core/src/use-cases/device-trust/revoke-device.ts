import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { Vault } from "../../domain/vault/vault";
import { revokeDeviceProfileFromVault } from "../../domain/vault/vault-device-mutations.utils";
import { UnsupportedAlgorithmSuiteError } from "../../application/errors/algorithm-suite.errors";
import {
  DeviceKeySlotNotFoundError,
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../application/errors/unlock-vault.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import type { UnlockedVaultSessionService } from "../../application/vault-session/unlocked-vault-session.service";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import {
  CannotRevokeCurrentDeviceError,
  DeviceProfileNotFoundForRevocationError,
  DeviceToRevokeNotTrustedError,
} from "./revoke-device.errors";

export type RevokeDeviceCommandParams = {
  readonly vaultId: string;
  readonly deviceId: string;
};

export type RevokeDeviceResult = {
  readonly vault: Vault;
  readonly revision: number;
  readonly revisionTimestamp: number;
  readonly deviceId: string;
};

export class RevokeDeviceUseCase {
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultLocalRepository = vaultLocalRepository;
  }

  async execute(
    params: RevokeDeviceCommandParams,
  ): Promise<RevokeDeviceResult> {
    // Revoke can only be performed by the currently unlocked vault, and a
    // device cannot revoke the local identity it is actively using.
    const unlockedVaultSession = await this.unlockedVaultSession.get();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "revoke device");
    }

    if (params.deviceId === unlockedVault.deviceId) {
      throw new CannotRevokeCurrentDeviceError(params.vaultId, params.deviceId);
    }

    // Start from the current local snapshot and verify its provenance before
    // using its trust and key-slot state as the basis for the new snapshot.
    const currentVaultSnapshot =
      await this.vaultLocalRepository.getVaultSnapshot(params.vaultId);

    if (currentVaultSnapshot === null) {
      throw new VaultSnapshotNotFoundError(params.vaultId);
    }

    if (
      currentVaultSnapshot.metadata.algorithmSuiteId !==
      this.crypto.algorithmSuite.id
    ) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId: params.vaultId,
        artifact: "vault snapshot",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: currentVaultSnapshot.metadata.algorithmSuiteId,
      });
    }

    const signerDevice = currentVaultSnapshot.trustedDevices.find(
      (device) => device.id === currentVaultSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        params.vaultId,
        currentVaultSnapshot.metadata.createdByDeviceId,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      currentVaultSnapshot,
      signerDevice.publicKeys.signingKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(params.vaultId);
    }

    // The local unlocked device must still be trusted, and the target must
    // exist in every trust surface we are about to remove it from.
    const isCurrentDeviceTrusted = currentVaultSnapshot.trustedDevices.some(
      (device) => device.id === unlockedVault.deviceId,
    );

    if (!isCurrentDeviceTrusted) {
      throw new VaultSnapshotSignerNotTrustedError(
        params.vaultId,
        unlockedVault.deviceId,
      );
    }

    const isRevokedDeviceTrusted = currentVaultSnapshot.trustedDevices.some(
      (device) => device.id === params.deviceId,
    );

    if (!isRevokedDeviceTrusted) {
      throw new DeviceToRevokeNotTrustedError(params.vaultId, params.deviceId);
    }

    const hasRevokedDeviceSlot = currentVaultSnapshot.keySlots.deviceSlots.some(
      (deviceSlot) => deviceSlot.deviceId === params.deviceId,
    );

    if (!hasRevokedDeviceSlot) {
      throw new DeviceKeySlotNotFoundError(params.vaultId, params.deviceId);
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

    // Rebuild the snapshot trust state without the revoked device and sign the
    // result as the still-trusted local device.
    const unsignedVaultSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        ...currentVaultSnapshot.metadata,
        revision: currentVaultSnapshot.metadata.revision + 1,
        revisionTimestamp,
        createdByDeviceId: unlockedVault.deviceId,
      },
      trustedDevices: currentVaultSnapshot.trustedDevices.filter(
        (trustedDevice) => trustedDevice.id !== params.deviceId,
      ),
      keySlots: {
        deviceSlots: currentVaultSnapshot.keySlots.deviceSlots.filter(
          (deviceSlot) => deviceSlot.deviceId !== params.deviceId,
        ),
        recoveryKeySlot: currentVaultSnapshot.keySlots.recoveryKeySlot,
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
    // the matching revision.
    await this.vaultLocalRepository.saveVaultSnapshot(revokedVaultSnapshot);

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: revokedVault,
    };

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      revokedVaultSnapshot.metadata.revision,
    );

    return {
      vault: revokedVault,
      revision: revokedVaultSnapshot.metadata.revision,
      revisionTimestamp: revokedVaultSnapshot.metadata.revisionTimestamp,
      deviceId: revokedVaultSnapshot.metadata.createdByDeviceId,
    };
  }
}
