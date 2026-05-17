import type { DeviceAccessMaterial } from "../domain/device/device-access-material";
import type { RawMasterPassword } from "../domain/master-password";
import type { CryptoPort } from "../ports/crypto.port";
import type { UnlockedVaultRepositoryPort } from "../ports/unlocked-vault-repository.port";
import type { VaultLocalRepositoryPort } from "../ports/vault-local-repository.port";
import {
  DeviceAccessMaterialNotFoundForMasterPasswordChangeError,
  VaultMustBeUnlockedForMasterPasswordChangeError,
} from "./errors/change-master-password.errors";

export type ChangeMasterPasswordCommandParams = {
  vaultId: string;
  currentMasterPassword: RawMasterPassword;
  newMasterPassword: RawMasterPassword;
};

export class ChangeMasterPasswordUseCase {
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

  async execute(params: ChangeMasterPasswordCommandParams): Promise<void> {
    const unlockedVault = await this.unlockedVaultRepository.getUnlockedVault();

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedForMasterPasswordChangeError(params.vaultId);
    }

    const deviceAccessMaterial =
      await this.vaultLocalRepository.getDeviceAccessMaterial(params.vaultId);

    if (deviceAccessMaterial === null) {
      throw new DeviceAccessMaterialNotFoundForMasterPasswordChangeError(
        params.vaultId,
      );
    }

    const currentLocalRootKey = await this.crypto.deriveLocalRootKey(
      params.currentMasterPassword,
      deviceAccessMaterial.masterPasswordSalt,
    );

    const currentLocalKeysProtectionKey =
      await this.crypto.deriveLocalKeysProtectionKey(
        currentLocalRootKey,
        deviceAccessMaterial.localKeysProtectionSalt,
      );

    const localKeysPayload = await this.crypto.unwrapLocalKeysPayload(
      deviceAccessMaterial.protectedLocalKeys,
      currentLocalKeysProtectionKey,
    );

    const newMasterPasswordSalt =
      await this.crypto.generateMasterPasswordSalt();
    const newLocalRootKey = await this.crypto.deriveLocalRootKey(
      params.newMasterPassword,
      newMasterPasswordSalt,
    );

    const newLocalKeysProtectionSalt =
      await this.crypto.generateLocalKeysProtectionSalt();
    const newLocalKeysProtectionKey =
      await this.crypto.deriveLocalKeysProtectionKey(
        newLocalRootKey,
        newLocalKeysProtectionSalt,
      );

    const protectedLocalKeys = await this.crypto.wrapLocalKeysPayload(
      localKeysPayload,
      newLocalKeysProtectionKey,
    );

    const updatedDeviceAccessMaterial: DeviceAccessMaterial = {
      ...deviceAccessMaterial,
      masterPasswordSalt: newMasterPasswordSalt,
      localKeysProtectionSalt: newLocalKeysProtectionSalt,
      protectedLocalKeys,
    };

    await this.vaultLocalRepository.saveDeviceAccessMaterial(
      updatedDeviceAccessMaterial,
    );
  }
}
