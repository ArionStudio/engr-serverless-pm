import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { IdPort } from "../../ports/system/id.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import {
  areDeviceAccessRecordsConsistent,
  isValidLocalAccessGenerationId,
} from "../../domain/device-trust/device-access-records";
import { getNextDeviceAccessRevision } from "../../domain/device-trust/device-access-revision";
import {
  DeviceAccessMaterialChangedError,
  DeviceAccessMaterialIdentityMismatchError,
} from "../../errors/vault-device.errors";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";

/** Replaces the local recovery wrapper. Retained older backups still work with their old words. */
export class ReplaceRecoveryWordsUseCase {
  private readonly crypto: CryptoPort;
  private readonly bip39: Bip39Port;
  private readonly ids: IdPort;
  private readonly repository: VaultLocalRepositoryPort;
  private readonly session: UnlockedVaultSessionService;
  constructor(
    crypto: CryptoPort,
    bip39: Bip39Port,
    ids: IdPort,
    repository: VaultLocalRepositoryPort,
    session: UnlockedVaultSessionService,
  ) {
    this.crypto = crypto;
    this.bip39 = bip39;
    this.ids = ids;
    this.repository = repository;
    this.session = session;
  }

  async execute({ vaultId }: { vaultId: string }) {
    return this.session.runWithUnlockedVaultContext(
      vaultId,
      "replace recovery words",
      async ({ unlockedVault: vault }) => {
        const {
          deviceAccessMaterial: material,
          deviceAccessRecoveryBackup: backup,
        } = await this.repository.getDeviceAccessRecords(vaultId);
        if (
          !material ||
          !backup ||
          material.vaultId !== vaultId ||
          material.deviceId !== vault.deviceId ||
          material.algorithmSuiteId !== this.crypto.algorithmSuite.id ||
          !areDeviceAccessRecordsConsistent(material, backup)
        ) {
          throw new DeviceAccessMaterialIdentityMismatchError(vaultId);
        }
        const trusted = vault.trustedSnapshotContext.trust.trustedDevices.find(
          (device) => device.deviceId === vault.deviceId,
        );
        if (
          !trusted ||
          !(await this.crypto.verifyDeviceSignKeyPair(
            material.devicePublicSignKey,
            vault.devicePrivateSignKey,
          )) ||
          !(await this.crypto.verifyDeviceVaultKeyPair(
            material.devicePublicVaultKey,
            vault.devicePrivateVaultKey,
          )) ||
          !(await this.crypto.verifyDeviceSignKeyPair(
            trusted.publicSignKey,
            vault.devicePrivateSignKey,
          )) ||
          !(await this.crypto.verifyDeviceVaultKeyPair(
            trusted.publicVaultKey,
            vault.devicePrivateVaultKey,
          ))
        ) {
          throw new DeviceAccessMaterialIdentityMismatchError(vaultId);
        }
        const revision = getNextDeviceAccessRevision(material.revision);
        const backupRevision = getNextDeviceAccessRevision(backup.revision);
        const generation = await this.ids.generateId();
        if (
          revision === null ||
          backupRevision === null ||
          !isValidLocalAccessGenerationId(generation) ||
          generation === material.localAccessGenerationId
        ) {
          throw new DeviceAccessMaterialChangedError(vaultId);
        }
        const secrets: ArrayBuffer[] = [];
        try {
          const key = await this.crypto.generateRecoveryKey();
          secrets.push(key);
          const recoveryMnemonicKey =
            await this.bip39.recoveryKeyToMnemonic(key);
          const salt =
            await this.crypto.generateRecoveryLocalKeysProtectionSalt();
          const protection =
            await this.crypto.deriveRecoveryLocalKeysProtectionKey(key, salt);
          secrets.push(protection);
          const protectedLocalKeys = await this.crypto.wrapLocalKeysPayload(
            {
              devicePrivateSignKey: vault.devicePrivateSignKey,
              devicePrivateVaultKey: vault.devicePrivateVaultKey,
              deviceLocalProtectionKey: vault.deviceLocalProtectionKey,
              vaultTrustAnchor: vault.vaultTrustAnchor,
            },
            protection,
          );
          await this.repository.saveDeviceAccessRecords({
            expectedDeviceAccessMaterialRevision: material.revision,
            expectedDeviceAccessMaterialGenerationId:
              material.localAccessGenerationId,
            expectedDeviceAccessRecoveryBackupRevision: backup.revision,
            expectedDeviceAccessRecoveryBackupGenerationId:
              backup.localAccessGenerationId,
            deviceAccessMaterial: {
              ...material,
              revision,
              localAccessGenerationId: generation,
            },
            deviceAccessRecoveryBackup: {
              ...backup,
              revision: backupRevision,
              localAccessGenerationId: generation,
              recoveryLocalKeysProtectionSalt: salt,
              protectedLocalKeys,
            },
          });
          return { recoveryMnemonicKey };
        } finally {
          bestEffortWipeArrayBuffers(secrets);
        }
      },
    );
  }
}
