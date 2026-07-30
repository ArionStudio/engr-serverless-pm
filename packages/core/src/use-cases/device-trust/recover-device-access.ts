import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust/device-access-recovery-backup";
import type { LocalKeysPayload } from "../../domain/device-trust/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import type { DeviceKeySlot } from "../../domain/snapshot";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceKeySlotNotFoundError,
  DeviceKeySlotVerificationFailedError,
  VaultSnapshotNotFoundError,
} from "../../errors/unlock-vault.errors";
import { PersistedVaultMismatchError } from "../../errors/vault-snapshot.errors";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import {
  DeviceAccessRecoveryBackupMismatchError,
  DeviceAccessRecoveryBackupNotFoundError,
} from "./recover-device-access.errors";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import {
  LocalVaultTrustCheckpointNotFoundError,
  VaultTrustStateInvalidError,
} from "../../errors/vault-trust.errors";

export type RecoverDeviceAccessCommandParams = {
  readonly vaultId: string;
  readonly recoveryMnemonicKey: RecoveryKeyMnemonic;
  readonly newMasterPassword: RawMasterPassword;
};

export type RecoverDeviceAccessResult = {
  readonly deviceId: string;
  readonly recoveryMnemonicKey: RecoveryKeyMnemonic;
};

export class RecoverDeviceAccessUseCase {
  private readonly bip39: Bip39Port;
  private readonly crypto: CryptoPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    bip39: Bip39Port,
    crypto: CryptoPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.bip39 = bip39;
    this.crypto = crypto;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultLocalRepository = vaultLocalRepository;
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async execute(
    params: RecoverDeviceAccessCommandParams,
  ): Promise<RecoverDeviceAccessResult> {
    await this.unlockedVaultSession.requireVaultCanBeActivated(params.vaultId);

    const recoveryBackup =
      await this.vaultLocalRepository.getDeviceAccessRecoveryBackup(
        params.vaultId,
      );

    if (recoveryBackup === null) {
      throw new DeviceAccessRecoveryBackupNotFoundError(params.vaultId);
    }

    if (recoveryBackup.vaultId !== params.vaultId) {
      throw new DeviceAccessRecoveryBackupMismatchError(params.vaultId);
    }

    if (recoveryBackup.algorithmSuiteId !== this.crypto.algorithmSuite.id) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId: params.vaultId,
        artifact: "device access recovery backup",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: recoveryBackup.algorithmSuiteId,
      });
    }

    const vaultSnapshot = await this.vaultLocalRepository.getVaultSnapshot(
      params.vaultId,
    );

    if (vaultSnapshot === null) {
      throw new VaultSnapshotNotFoundError(params.vaultId);
    }

    if (vaultSnapshot.metadata.id !== params.vaultId) {
      throw new PersistedVaultMismatchError(
        params.vaultId,
        vaultSnapshot.metadata.id,
      );
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

    if (vaultSnapshot.metadata.schemaVersion !== 1) {
      throw new VaultTrustStateInvalidError(
        params.vaultId,
        "unsupported snapshot schema version",
      );
    }

    const deviceKeySlot = vaultSnapshot.keySlots.deviceSlots.find(
      (slot: DeviceKeySlot) => slot.deviceId === recoveryBackup.deviceId,
    );

    if (deviceKeySlot === undefined) {
      throw new DeviceKeySlotNotFoundError(
        params.vaultId,
        recoveryBackup.deviceId,
      );
    }

    const recoverySecretKey = await this.bip39.mnemonicToRecoveryKey(
      params.recoveryMnemonicKey,
    );
    const recoveryLocalKeysProtectionKey =
      await this.crypto.deriveRecoveryLocalKeysProtectionKey(
        recoverySecretKey,
        recoveryBackup.recoveryLocalKeysProtectionSalt,
      );
    const localKeysPayload: LocalKeysPayload =
      await this.crypto.unwrapLocalKeysPayload(
        recoveryBackup.protectedLocalKeys,
        recoveryLocalKeysProtectionKey,
      );
    const doesDeviceSigningKeyMatchBackup =
      await this.crypto.verifyDeviceSignKeyPair(
        recoveryBackup.devicePublicSignKey,
        localKeysPayload.devicePrivateSignKey,
      );
    const doesDeviceVaultKeyMatchBackup =
      await this.crypto.verifyDeviceVaultKeyPair(
        recoveryBackup.devicePublicVaultKey,
        localKeysPayload.devicePrivateVaultKey,
      );

    if (!doesDeviceSigningKeyMatchBackup || !doesDeviceVaultKeyMatchBackup) {
      throw new DeviceKeySlotVerificationFailedError(
        params.vaultId,
        recoveryBackup.deviceId,
      );
    }

    if (vaultSnapshot.trustChain === undefined) {
      throw new VaultTrustStateInvalidError(
        params.vaultId,
        "trust chain is missing",
      );
    }

    const checkpoint =
      await this.vaultLocalRepository.getLocalVaultTrustCheckpoint(
        params.vaultId,
      );

    if (checkpoint === null) {
      throw new LocalVaultTrustCheckpointNotFoundError(params.vaultId);
    }

    const localDeviceIdentity = {
      deviceId: recoveryBackup.deviceId,
      publicSignKey: recoveryBackup.devicePublicSignKey,
      publicVaultKey: recoveryBackup.devicePublicVaultKey,
    };
    await this.vaultTrust.verifyCheckpoint(
      params.vaultId,
      checkpoint,
      localDeviceIdentity,
    );
    const verifiedTrust = await this.vaultTrust.verifyTrustChain(
      params.vaultId,
      localKeysPayload.vaultTrustAnchor,
      vaultSnapshot.trustChain,
    );
    const trustedRecoveredDevice = verifiedTrust.trustedDevices.find(
      (device) => device.deviceId === recoveryBackup.deviceId,
    );

    if (
      trustedRecoveredDevice === undefined ||
      !(await this.crypto.verifyDeviceSignKeyPair(
        trustedRecoveredDevice.publicSignKey,
        localKeysPayload.devicePrivateSignKey,
      )) ||
      !(await this.crypto.verifyDeviceVaultKeyPair(
        trustedRecoveredDevice.publicVaultKey,
        localKeysPayload.devicePrivateVaultKey,
      ))
    ) {
      throw new VaultTrustStateInvalidError(
        params.vaultId,
        "recovered device is not trusted",
      );
    }

    await this.vaultTrust.verifySnapshot(
      params.vaultId,
      vaultSnapshot,
      verifiedTrust,
    );
    const checkpointRelation =
      await this.vaultTrust.requireSnapshotNotRolledBack(
        params.vaultId,
        vaultSnapshot,
        verifiedTrust,
        checkpoint,
      );

    const vaultMasterKey = await this.crypto.openDeviceVaultKeyEnvelope(
      deviceKeySlot.envelope,
      localKeysPayload.devicePrivateVaultKey,
      {
        vaultId: params.vaultId,
        deviceId: recoveryBackup.deviceId,
        vaultKeyGeneration: vaultSnapshot.metadata.vaultKeyGeneration,
        algorithmSuiteId: vaultSnapshot.metadata.algorithmSuiteId,
      },
    );

    await this.crypto.decryptVaultSnapshotContent(
      vaultSnapshot.content,
      vaultMasterKey,
    );

    if (checkpointRelation === "newer") {
      await this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
        expectedSnapshotDigest:
          await this.crypto.digestVaultSnapshot(vaultSnapshot),
        snapshot: vaultSnapshot,
        checkpoint: await this.vaultTrust.createCheckpoint(
          vaultSnapshot,
          verifiedTrust,
          recoveryBackup.deviceId,
          localKeysPayload.devicePrivateSignKey,
        ),
      });
    }

    const masterPasswordSalt = await this.crypto.generateMasterPasswordSalt();
    const localRootKey = await this.crypto.deriveLocalRootKey(
      params.newMasterPassword,
      masterPasswordSalt,
    );
    const localKeysProtectionSalt =
      await this.crypto.generateLocalKeysProtectionSalt();
    const localKeysProtectionKey =
      await this.crypto.deriveLocalKeysProtectionKey(
        localRootKey,
        localKeysProtectionSalt,
      );
    const protectedLocalKeys = await this.crypto.wrapLocalKeysPayload(
      localKeysPayload,
      localKeysProtectionKey,
    );
    const nextRecoverySecretKey = await this.crypto.generateRecoveryKey();
    const nextRecoveryMnemonicKey = await this.bip39.recoveryKeyToMnemonic(
      nextRecoverySecretKey,
    );
    const nextRecoveryLocalKeysProtectionSalt =
      await this.crypto.generateRecoveryLocalKeysProtectionSalt();
    const nextRecoveryLocalKeysProtectionKey =
      await this.crypto.deriveRecoveryLocalKeysProtectionKey(
        nextRecoverySecretKey,
        nextRecoveryLocalKeysProtectionSalt,
      );
    const nextRecoveryProtectedLocalKeys =
      await this.crypto.wrapLocalKeysPayload(
        localKeysPayload,
        nextRecoveryLocalKeysProtectionKey,
      );
    const deviceAccessMaterial: DeviceAccessMaterial = {
      vaultId: params.vaultId,
      deviceId: recoveryBackup.deviceId,
      algorithmSuiteId: this.crypto.algorithmSuite.id,
      masterPasswordSalt,
      localKeysProtectionSalt,
      devicePublicSignKey: recoveryBackup.devicePublicSignKey,
      devicePublicVaultKey: recoveryBackup.devicePublicVaultKey,
      protectedLocalKeys,
    };
    const deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup = {
      vaultId: params.vaultId,
      deviceId: recoveryBackup.deviceId,
      algorithmSuiteId: this.crypto.algorithmSuite.id,
      recoveryLocalKeysProtectionSalt: nextRecoveryLocalKeysProtectionSalt,
      devicePublicSignKey: recoveryBackup.devicePublicSignKey,
      devicePublicVaultKey: recoveryBackup.devicePublicVaultKey,
      protectedLocalKeys: nextRecoveryProtectedLocalKeys,
    };

    await this.vaultLocalRepository.saveRecoveredDeviceAccess(
      deviceAccessMaterial,
      deviceAccessRecoveryBackup,
    );

    return {
      deviceId: recoveryBackup.deviceId,
      recoveryMnemonicKey: nextRecoveryMnemonicKey,
    };
  }
}
