import type { DeviceAccessMaterial } from "../domain/device/device-access-material";
import type { Device } from "../domain/device/device";
import type { LocalKeysPayload } from "../domain/local-protection/local-protection.type";
import type { RawMasterPassword } from "../domain/master-password";
import type { RecoveryKeyMnemonic } from "../domain/recovery/bip39-mnemonic";
import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../domain/snapshot/vault-snapshot";
import type { UnlockedVault } from "../domain/vault/unlocked-vault";
import type { Vault } from "../domain/vault/vault";
import type { Bip39Port } from "../ports/bip39.port";
import type { ClockPort } from "../ports/clock.port";
import type { CryptoPort } from "../ports/crypto.port";
import type { IdPort } from "../ports/id.port";
import type { UnlockedVaultRepositoryPort } from "../ports/unlocked-vault-repository.port";
import type { VaultLocalRepositoryPort } from "../ports/vault-local-repository.port";

export type InitializeVaultCommandParams = {
  masterPassword: RawMasterPassword;
  deviceName: string;
};

export type InitializeVaultResult = {
  recoveryMnemonicKey: RecoveryKeyMnemonic;
};

export class InitializeVaultUseCase {
  private readonly crypto: CryptoPort;
  private readonly bip39: Bip39Port;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;
  private readonly ids: IdPort;
  private readonly clock: ClockPort;

  constructor(
    crypto: CryptoPort,
    bip39: Bip39Port,
    vaultLocalRepository: VaultLocalRepositoryPort,
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
    ids: IdPort,
    clock: ClockPort,
  ) {
    this.crypto = crypto;
    this.bip39 = bip39;
    this.vaultLocalRepository = vaultLocalRepository;
    this.unlockedVaultRepository = unlockedVaultRepository;
    this.ids = ids;
    this.clock = clock;
  }

  async execute(
    initializeVaultCommandParams: InitializeVaultCommandParams,
  ): Promise<InitializeVaultResult> {
    const vaultId = await this.ids.generateId();
    const deviceId = await this.ids.generateId();
    const timestamp = this.clock.now();

    const vaultMasterKey = await this.crypto.generateVaultMasterKey();
    const deviceSlotKey = await this.crypto.generateDeviceSlotKey();
    const deviceSignKeyPair = await this.crypto.generateDeviceSignKeyPair();
    const recoverySecretKey = await this.crypto.generateRecoveryKey();
    const recoveryMnemonicKey =
      await this.bip39.recoveryKeyToMnemonic(recoverySecretKey);

    const masterPasswordSalt = await this.crypto.generateMasterPasswordSalt();
    const localRootKey = await this.crypto.deriveLocalRootKey(
      initializeVaultCommandParams.masterPassword,
      masterPasswordSalt,
    );

    const localKeysProtectionSalt =
      await this.crypto.generateLocalKeysProtectionSalt();

    const localKeysProtectionKey =
      await this.crypto.deriveLocalKeysProtectionKey(
        localRootKey,
        localKeysProtectionSalt,
      );

    const localKeysPayload: LocalKeysPayload = {
      deviceSlotKey: deviceSlotKey,
      devicePrivateSignKey: deviceSignKeyPair.privateKey,
    };

    const protectedLocalKeys = await this.crypto.wrapLocalKeysPayload(
      localKeysPayload,
      localKeysProtectionKey,
    );

    const deviceSlotVaultMasterKeyProtectionKey =
      await this.crypto.deriveDeviceSlotVaultMasterKeyProtectionKey(
        deviceSlotKey,
      );
    const recoveryVaultMasterKeyProtectionKey =
      await this.crypto.deriveRecoveryVaultMasterKeyProtectionKey(
        recoverySecretKey,
      );

    const protectedDeviceVaultMasterKey = await this.crypto.wrapVaultMasterKey(
      vaultMasterKey,
      deviceSlotVaultMasterKeyProtectionKey,
    );
    const protectedRecoveryVaultMasterKey =
      await this.crypto.wrapVaultMasterKey(
        vaultMasterKey,
        recoveryVaultMasterKeyProtectionKey,
      );

    const device: Device = {
      id: deviceId,
      name: initializeVaultCommandParams.deviceName,
      createdAt: new Date(timestamp),
      publicKeys: {
        signingKey: deviceSignKeyPair.publicKey,
      },
    };

    const vault: Vault = {
      entries: [],
      registeredDevices: [device],
      tags: [],
    };

    const unsignedVaultSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        id: vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: timestamp,
        revisionTimestamp: timestamp,
        revision: 1,
        algorithmSuiteId: this.crypto.algorithmSuite.id,
        createdByDeviceId: deviceId,
      },
      keySlots: {
        deviceSlots: [
          {
            deviceId,
            protectedVaultMasterKey: protectedDeviceVaultMasterKey,
          },
        ],
        recoveryKeySlot: {
          protectedVaultMasterKey: protectedRecoveryVaultMasterKey,
        },
      },
      content: await this.crypto.encryptVaultSnapshotContent(
        vault,
        vaultMasterKey,
      ),
    };

    const vaultSnapshot: VaultSnapshot = {
      ...unsignedVaultSnapshot,
      signature: await this.crypto.signVaultSnapshot(
        unsignedVaultSnapshot,
        deviceSignKeyPair.privateKey,
      ),
    };

    const deviceAccessMaterial: DeviceAccessMaterial = {
      vaultId,
      deviceId,
      algorithmSuiteId: this.crypto.algorithmSuite.id,
      masterPasswordSalt,
      localKeysProtectionSalt,
      protectedLocalKeys,
    };

    const unlockedVault: UnlockedVault = {
      vaultId,
      deviceId,
      vault,
      vaultMasterKey,
      devicePrivateSignKey: deviceSignKeyPair.privateKey,
    };

    await this.vaultLocalRepository.saveDeviceAccessMaterial(
      deviceAccessMaterial,
    );
    await this.vaultLocalRepository.saveVaultSnapshot(vaultSnapshot);
    await this.unlockedVaultRepository.saveUnlockedVault(unlockedVault);

    return {
      recoveryMnemonicKey,
    };
  }
}
