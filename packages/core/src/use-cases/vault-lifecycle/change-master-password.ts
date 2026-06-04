import type { DeviceAccessMaterial } from "../../domain/device/device-access-material";
import type { RawMasterPassword } from "../../domain/master-password";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { UnsupportedAlgorithmSuiteError } from "../__errors/algorithm-suite.errors";
import {
  DeviceAccessMaterialNotFoundForMasterPasswordChangeError,
  VaultMustBeUnlockedForMasterPasswordChangeError,
} from "../__errors/change-master-password.errors";
import type { GetUnlockedVaultSessionService } from "../../application/vault-session/get-unlocked-vault-session.service";

export type ChangeMasterPasswordCommandParams = {
  vaultId: string;
  currentMasterPassword: RawMasterPassword;
  newMasterPassword: RawMasterPassword;
};

export class ChangeMasterPasswordUseCase {
  private readonly crypto: CryptoPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly getUnlockedVaultSession: GetUnlockedVaultSessionService;

  constructor(
    crypto: CryptoPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
    getUnlockedVaultSession: GetUnlockedVaultSessionService,
  ) {
    this.crypto = crypto;
    this.vaultLocalRepository = vaultLocalRepository;
    this.getUnlockedVaultSession = getUnlockedVaultSession;
  }

  async execute(params: ChangeMasterPasswordCommandParams): Promise<void> {
    const unlockedVaultSession = await this.getUnlockedVaultSession.get();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

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
