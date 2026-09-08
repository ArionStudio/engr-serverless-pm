import type { RawMasterPassword } from "../../domain/master-password";
import type { SyncCredentials } from "../../domain/sync/sync-config.type";
import { areDeviceAccessRecordsConsistent } from "../../domain/device-trust/device-access-records";
import { DeviceAccessMaterialIdentityMismatchError } from "../../errors/vault-device.errors";
import {
  LocalSyncCredentialsMissingError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export class RevealSyncCredentialsUseCase {
  private readonly crypto: CryptoPort;
  private readonly repository: VaultLocalRepositoryPort;
  private readonly session: UnlockedVaultSessionService;
  constructor(
    crypto: CryptoPort,
    repository: VaultLocalRepositoryPort,
    session: UnlockedVaultSessionService,
  ) {
    this.crypto = crypto;
    this.repository = repository;
    this.session = session;
  }

  async execute(params: {
    readonly vaultId: string;
    readonly masterPassword: RawMasterPassword;
  }): Promise<{
    readonly credentials: SyncCredentials;
    readonly sessionId: string;
  }> {
    return this.session.runWithUnlockedVaultContext(
      params.vaultId,
      "reveal sync access keys",
      async ({ unlockedVault, sessionId }) => {
        const target = unlockedVault.vault.syncTarget;
        if (!target)
          throw new SyncNotConfiguredError(
            params.vaultId,
            "revealing access keys",
          );
        const {
          deviceAccessMaterial: material,
          deviceAccessRecoveryBackup: backup,
        } = await this.repository.getDeviceAccessRecords(params.vaultId);
        const trustedDevice =
          unlockedVault.trustedSnapshotContext.trust.trustedDevices.find(
            (device) => device.deviceId === unlockedVault.deviceId,
          );
        if (
          !material ||
          !backup ||
          !trustedDevice ||
          !areDeviceAccessRecordsConsistent(material, backup) ||
          material.vaultId !== params.vaultId ||
          material.deviceId !== unlockedVault.deviceId ||
          material.algorithmSuiteId !== this.crypto.algorithmSuite.id
        )
          throw new DeviceAccessMaterialIdentityMismatchError(params.vaultId);

        const secrets: ArrayBuffer[] = [];
        try {
          const rootKey = await this.crypto.deriveLocalRootKey(
            params.masterPassword,
            material.masterPasswordSalt,
          );
          secrets.push(rootKey);
          const protectionKey = await this.crypto.deriveLocalKeysProtectionKey(
            rootKey,
            material.localKeysProtectionSalt,
          );
          secrets.push(protectionKey);
          const payload = await this.crypto.unwrapLocalKeysPayload(
            material.protectedLocalKeys,
            protectionKey,
          );
          secrets.push(
            payload.devicePrivateSignKey,
            payload.devicePrivateVaultKey,
            payload.deviceLocalProtectionKey,
          );
          if (
            !(await this.crypto.verifyDeviceSignKeyPair(
              material.devicePublicSignKey,
              payload.devicePrivateSignKey,
            )) ||
            !(await this.crypto.verifyDeviceVaultKeyPair(
              material.devicePublicVaultKey,
              payload.devicePrivateVaultKey,
            )) ||
            !(await this.crypto.verifyDeviceSignKeyPair(
              trustedDevice.publicSignKey,
              payload.devicePrivateSignKey,
            )) ||
            !(await this.crypto.verifyDeviceVaultKeyPair(
              trustedDevice.publicVaultKey,
              payload.devicePrivateVaultKey,
            ))
          )
            throw new DeviceAccessMaterialIdentityMismatchError(params.vaultId);

          const encrypted = await this.repository.getDeviceSyncCredentialState(
            params.vaultId,
          );
          if (!encrypted)
            throw new LocalSyncCredentialsMissingError(params.vaultId);
          const state = await this.crypto.decryptDeviceSyncCredentialState(
            encrypted,
            payload.deviceLocalProtectionKey,
            {
              vaultId: params.vaultId,
              deviceId: unlockedVault.deviceId,
              provider: target.provider,
              target,
            },
          );
          if (state.currentCredentials.provider !== target.provider)
            throw new LocalSyncCredentialsMissingError(params.vaultId);
          return { credentials: state.currentCredentials, sessionId };
        } finally {
          bestEffortWipeArrayBuffers(secrets);
        }
      },
    );
  }
}
