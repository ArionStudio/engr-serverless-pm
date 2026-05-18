import type { LocalKeysPayload } from "../domain/local-protection/local-protection.type";
import type { RawMasterPassword } from "../domain/master-password";
import type { DeviceKeySlot } from "../domain/snapshot/key-slot";
import type { UnlockedVault } from "../domain/vault/unlocked-vault";
import type { Vault } from "../domain/vault/vault";
import type { CryptoPort } from "../ports/crypto.port";
import type { UnlockedVaultRepositoryPort } from "../ports/unlocked-vault-repository.port";
import type { VaultLocalRepositoryPort } from "../ports/vault-local-repository.port";
import { UnsupportedAlgorithmSuiteError } from "./errors/algorithm-suite.errors";
import {
  DeviceAccessMaterialNotFoundError,
  DeviceKeySlotNotFoundError,
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "./errors/unlock-vault.errors";

export type UnlockVaultCommandParams = {
  vaultId: string;
  masterPassword: RawMasterPassword;
};

export type UnlockVaultResult = {
  vault: Vault;
};

export class UnlockVaultUseCase {
  private readonly crypto: CryptoPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(
    crypto: CryptoPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
  ) {
    this.crypto = crypto;
    this.vaultLocalRepository = vaultLocalRepository;
    this.unlockedVaultRepository = unlockedVaultRepository;
  }

  async execute(params: UnlockVaultCommandParams): Promise<UnlockVaultResult> {
    const deviceAccessMaterial =
      await this.vaultLocalRepository.getDeviceAccessMaterial(params.vaultId);

    if (deviceAccessMaterial === null) {
      throw new DeviceAccessMaterialNotFoundError(params.vaultId);
    }

    const vaultSnapshot = await this.vaultLocalRepository.getVaultSnapshot(
      params.vaultId,
    );

    if (vaultSnapshot === null) {
      throw new VaultSnapshotNotFoundError(params.vaultId);
    }

    if (
      deviceAccessMaterial.algorithmSuiteId !== this.crypto.algorithmSuite.id
    ) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId: params.vaultId,
        artifact: "device access material",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: deviceAccessMaterial.algorithmSuiteId,
      });
    }

    if (
      vaultSnapshot.metadata.algorithmSuiteId !== this.crypto.algorithmSuite.id
    ) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId: params.vaultId,
        artifact: "vault snapshot",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: vaultSnapshot.metadata.algorithmSuiteId,
      });
    }

    const signerDevice = vaultSnapshot.trustedDevices.find(
      (device) => device.id === vaultSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        params.vaultId,
        vaultSnapshot.metadata.createdByDeviceId,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      vaultSnapshot,
      signerDevice.publicKeys.signingKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(params.vaultId);
    }

    const localRootKey = await this.crypto.deriveLocalRootKey(
      params.masterPassword,
      deviceAccessMaterial.masterPasswordSalt,
    );

    const localKeysProtectionKey =
      await this.crypto.deriveLocalKeysProtectionKey(
        localRootKey,
        deviceAccessMaterial.localKeysProtectionSalt,
      );

    const localKeysPayload: LocalKeysPayload =
      await this.crypto.unwrapLocalKeysPayload(
        deviceAccessMaterial.protectedLocalKeys,
        localKeysProtectionKey,
      );

    const deviceKeySlot = vaultSnapshot.keySlots.deviceSlots.find(
      (slot: DeviceKeySlot) => slot.deviceId === deviceAccessMaterial.deviceId,
    );

    if (deviceKeySlot === undefined) {
      throw new DeviceKeySlotNotFoundError(
        params.vaultId,
        deviceAccessMaterial.deviceId,
      );
    }

    const vaultMasterKeyProtectionKey =
      await this.crypto.deriveDeviceSlotVaultMasterKeyProtectionKey(
        localKeysPayload.deviceSlotKey,
      );

    const vaultMasterKey = await this.crypto.unwrapVaultMasterKey(
      deviceKeySlot.protectedVaultMasterKey,
      vaultMasterKeyProtectionKey,
    );

    const vault = await this.crypto.decryptVaultSnapshotContent(
      vaultSnapshot.content,
      vaultMasterKey,
    );

    const unlockedVault: UnlockedVault = {
      vaultId: params.vaultId,
      deviceId: deviceAccessMaterial.deviceId,
      vault,
      vaultMasterKey,
      devicePrivateSignKey: localKeysPayload.devicePrivateSignKey,
    };

    await this.unlockedVaultRepository.saveUnlockedVault(unlockedVault);

    return {
      vault,
    };
  }
}
