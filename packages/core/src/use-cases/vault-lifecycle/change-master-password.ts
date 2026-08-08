import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { RawMasterPassword } from "../../domain/master-password";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceAccessMaterialNotFoundForMasterPasswordChangeError,
  VaultMustBeUnlockedForMasterPasswordChangeError,
} from "../../errors/change-master-password.errors";
import { DeviceAccessMaterialIdentityMismatchError } from "../../errors/vault-device.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export type ChangeMasterPasswordCommandParams = {
  vaultId: string;
  currentMasterPassword: RawMasterPassword;
  newMasterPassword: RawMasterPassword;
};

export class ChangeMasterPasswordUseCase {
  private readonly crypto: CryptoPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;

  constructor(
    crypto: CryptoPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
  ) {
    this.crypto = crypto;
    this.vaultLocalRepository = vaultLocalRepository;
    this.unlockedVaultSession = unlockedVaultSession;
  }

  async execute(params: ChangeMasterPasswordCommandParams): Promise<void> {
    const unlockedVaultSession = await this.unlockedVaultSession.get();

    if (unlockedVaultSession?.unlockedVault.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedForMasterPasswordChangeError(params.vaultId);
    }

    const unlockedVault = unlockedVaultSession.unlockedVault;

    await this.unlockedVaultSession.persistForActiveSession(
      unlockedVaultSession.sessionId,
      params.vaultId,
      async () => {
        const deviceAccessMaterial =
          await this.vaultLocalRepository.getDeviceAccessMaterial(
            params.vaultId,
          );

        if (deviceAccessMaterial === null) {
          throw new DeviceAccessMaterialNotFoundForMasterPasswordChangeError(
            params.vaultId,
          );
        }

        if (
          deviceAccessMaterial.vaultId !== params.vaultId ||
          deviceAccessMaterial.deviceId !== unlockedVault.deviceId
        ) {
          throw new DeviceAccessMaterialIdentityMismatchError(params.vaultId);
        }

        if (
          deviceAccessMaterial.algorithmSuiteId !==
          this.crypto.algorithmSuite.id
        ) {
          throw new UnsupportedAlgorithmSuiteError({
            vaultId: params.vaultId,
            artifact: "device access material",
            expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
            actualAlgorithmSuiteId: deviceAccessMaterial.algorithmSuiteId,
          });
        }

        const trustedDevice =
          unlockedVault.trustedSnapshotContext.trust.trustedDevices.find(
            (device) => device.deviceId === unlockedVault.deviceId,
          );

        if (
          trustedDevice === undefined ||
          !(await this.crypto.verifyDeviceSignKeyPair(
            deviceAccessMaterial.devicePublicSignKey,
            unlockedVault.devicePrivateSignKey,
          )) ||
          !(await this.crypto.verifyDeviceVaultKeyPair(
            deviceAccessMaterial.devicePublicVaultKey,
            unlockedVault.devicePrivateVaultKey,
          )) ||
          !(await this.crypto.verifyDeviceSignKeyPair(
            trustedDevice.publicSignKey,
            unlockedVault.devicePrivateSignKey,
          )) ||
          !(await this.crypto.verifyDeviceVaultKeyPair(
            trustedDevice.publicVaultKey,
            unlockedVault.devicePrivateVaultKey,
          ))
        ) {
          throw new DeviceAccessMaterialIdentityMismatchError(params.vaultId);
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

        if (
          !(await this.crypto.verifyDeviceSignKeyPair(
            deviceAccessMaterial.devicePublicSignKey,
            localKeysPayload.devicePrivateSignKey,
          )) ||
          !(await this.crypto.verifyDeviceVaultKeyPair(
            deviceAccessMaterial.devicePublicVaultKey,
            localKeysPayload.devicePrivateVaultKey,
          ))
        ) {
          throw new DeviceAccessMaterialIdentityMismatchError(params.vaultId);
        }

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
          revision: deviceAccessMaterial.revision + 1,
          masterPasswordSalt: newMasterPasswordSalt,
          localKeysProtectionSalt: newLocalKeysProtectionSalt,
          protectedLocalKeys,
        };

        await this.vaultLocalRepository.saveDeviceAccessMaterial({
          expectedDeviceAccessMaterialRevision: deviceAccessMaterial.revision,
          deviceAccessMaterial: updatedDeviceAccessMaterial,
        });
      },
    );
  }
}
