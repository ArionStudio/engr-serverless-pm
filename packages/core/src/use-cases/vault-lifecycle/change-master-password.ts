import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import { getNextDeviceAccessRevision } from "../../domain/device-trust/device-access-revision";
import {
  areDeviceAccessRecordsConsistent,
  isValidLocalAccessGenerationId,
} from "../../domain/device-trust/device-access-records";
import type { RawMasterPassword } from "../../domain/master-password";
import { assertNewMasterPasswordMeetsPolicy } from "../../domain/master-password/master-password.utils";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceAccessMaterialNotFoundForMasterPasswordChangeError,
  VaultMustBeUnlockedForMasterPasswordChangeError,
} from "../../errors/change-master-password.errors";
import {
  DeviceAccessMaterialChangedError,
  DeviceAccessMaterialIdentityMismatchError,
} from "../../errors/vault-device.errors";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";
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
  private readonly ids: IdPort;

  constructor(
    crypto: CryptoPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    ids: IdPort,
  ) {
    this.crypto = crypto;
    this.vaultLocalRepository = vaultLocalRepository;
    this.unlockedVaultSession = unlockedVaultSession;
    this.ids = ids;
  }

  async execute(params: ChangeMasterPasswordCommandParams): Promise<void> {
    assertNewMasterPasswordMeetsPolicy(params.newMasterPassword);

    const unlockedVaultSession = await this.unlockedVaultSession.get();

    if (unlockedVaultSession?.unlockedVault.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedForMasterPasswordChangeError(params.vaultId);
    }

    const unlockedVault = unlockedVaultSession.unlockedVault;

    await this.unlockedVaultSession.persistForActiveSession(
      unlockedVaultSession.sessionId,
      params.vaultId,
      async () => {
        const { deviceAccessMaterial, deviceAccessRecoveryBackup } =
          await this.vaultLocalRepository.getDeviceAccessRecords(
            params.vaultId,
          );

        if (deviceAccessMaterial === null) {
          throw new DeviceAccessMaterialNotFoundForMasterPasswordChangeError(
            params.vaultId,
          );
        }

        if (
          deviceAccessRecoveryBackup === null ||
          deviceAccessMaterial.vaultId !== params.vaultId ||
          deviceAccessMaterial.deviceId !== unlockedVault.deviceId ||
          !areDeviceAccessRecordsConsistent(
            deviceAccessMaterial,
            deviceAccessRecoveryBackup,
          )
        ) {
          throw new DeviceAccessMaterialIdentityMismatchError(params.vaultId);
        }

        const nextDeviceAccessMaterialRevision = getNextDeviceAccessRevision(
          deviceAccessMaterial.revision,
        );
        const nextDeviceAccessRecoveryBackupRevision =
          getNextDeviceAccessRevision(deviceAccessRecoveryBackup.revision);

        if (
          nextDeviceAccessMaterialRevision === null ||
          nextDeviceAccessRecoveryBackupRevision === null
        ) {
          throw new DeviceAccessMaterialChangedError(params.vaultId);
        }

        const localAccessGenerationId = await this.ids.generateId();

        if (
          !isValidLocalAccessGenerationId(localAccessGenerationId) ||
          localAccessGenerationId ===
            deviceAccessMaterial.localAccessGenerationId
        ) {
          throw new DeviceAccessMaterialChangedError(params.vaultId);
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

        const ownedSecrets: ArrayBuffer[] = [];

        try {
          const currentLocalRootKey = await this.crypto.deriveLocalRootKey(
            params.currentMasterPassword,
            deviceAccessMaterial.masterPasswordSalt,
          );
          ownedSecrets.push(currentLocalRootKey);

          const currentLocalKeysProtectionKey =
            await this.crypto.deriveLocalKeysProtectionKey(
              currentLocalRootKey,
              deviceAccessMaterial.localKeysProtectionSalt,
            );
          ownedSecrets.push(currentLocalKeysProtectionKey);

          const localKeysPayload = await this.crypto.unwrapLocalKeysPayload(
            deviceAccessMaterial.protectedLocalKeys,
            currentLocalKeysProtectionKey,
          );
          ownedSecrets.push(
            localKeysPayload.devicePrivateSignKey,
            localKeysPayload.devicePrivateVaultKey,
            localKeysPayload.deviceLocalProtectionKey,
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
          ownedSecrets.push(newLocalRootKey);

          const newLocalKeysProtectionSalt =
            await this.crypto.generateLocalKeysProtectionSalt();
          const newLocalKeysProtectionKey =
            await this.crypto.deriveLocalKeysProtectionKey(
              newLocalRootKey,
              newLocalKeysProtectionSalt,
            );
          ownedSecrets.push(newLocalKeysProtectionKey);

          const protectedLocalKeys = await this.crypto.wrapLocalKeysPayload(
            localKeysPayload,
            newLocalKeysProtectionKey,
          );

          const updatedDeviceAccessMaterial: DeviceAccessMaterial = {
            ...deviceAccessMaterial,
            revision: nextDeviceAccessMaterialRevision,
            localAccessGenerationId,
            masterPasswordSalt: newMasterPasswordSalt,
            localKeysProtectionSalt: newLocalKeysProtectionSalt,
            protectedLocalKeys,
          };
          const updatedDeviceAccessRecoveryBackup = {
            ...deviceAccessRecoveryBackup,
            revision: nextDeviceAccessRecoveryBackupRevision,
            localAccessGenerationId,
          };

          await this.vaultLocalRepository.saveDeviceAccessRecords({
            expectedDeviceAccessMaterialRevision: deviceAccessMaterial.revision,
            expectedDeviceAccessMaterialGenerationId:
              deviceAccessMaterial.localAccessGenerationId,
            expectedDeviceAccessRecoveryBackupRevision:
              deviceAccessRecoveryBackup.revision,
            expectedDeviceAccessRecoveryBackupGenerationId:
              deviceAccessRecoveryBackup.localAccessGenerationId,
            deviceAccessMaterial: updatedDeviceAccessMaterial,
            deviceAccessRecoveryBackup: updatedDeviceAccessRecoveryBackup,
          });
        } finally {
          bestEffortWipeArrayBuffers(ownedSecrets);
        }
      },
    );
  }
}
