import type { DeviceAccessMaterial } from "../../domain/device/device-access-material";
import type { DeviceProfile } from "../../domain/device/device";
import type { LocalKeysPayload } from "../../domain/local-protection/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";
import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import type { Vault } from "../../domain/vault/vault";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type { VaultDisplayNamePort } from "../../ports/vault/vault-display-name.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../application/vault-session/unlocked-vault-session.service";

export type InitializeVaultCommandParams = {
  masterPassword: RawMasterPassword;
  deviceName: string;
};

export type InitializeVaultResult = {
  recoveryMnemonicKey: RecoveryKeyMnemonic;
  vaultDisplayName: string;
};

export class InitializeVaultUseCase {
  private readonly crypto: CryptoPort;
  private readonly bip39: Bip39Port;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly ids: IdPort;
  private readonly clock: ClockPort;
  private readonly vaultDisplayName: VaultDisplayNamePort;

  constructor(
    crypto: CryptoPort,
    bip39: Bip39Port,
    vaultLocalRepository: VaultLocalRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    ids: IdPort,
    clock: ClockPort,
    vaultDisplayName: VaultDisplayNamePort,
  ) {
    this.crypto = crypto;
    this.bip39 = bip39;
    this.vaultLocalRepository = vaultLocalRepository;
    this.unlockedVaultSession = unlockedVaultSession;
    this.ids = ids;
    this.clock = clock;
    this.vaultDisplayName = vaultDisplayName;
  }

  async execute(
    initializeVaultCommandParams: InitializeVaultCommandParams,
  ): Promise<InitializeVaultResult> {
    const vaultId = await this.ids.generateId();
    await this.unlockedVaultSession.assertCanActivate(vaultId);

    const deviceId = await this.ids.generateId();
    const timestamp = this.clock.now();
    const vaultDisplayName =
      await this.vaultDisplayName.generateVaultDisplayName();

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

    const deviceProfile: DeviceProfile = {
      id: deviceId,
      name: initializeVaultCommandParams.deviceName,
      createdAt: timestamp,
      versionVector: {
        [deviceId]: 1,
      },
    };

    const vault: Vault = {
      versionVector: {
        [deviceId]: 1,
      },
      entries: [],
      deletedEntries: [],
      deviceProfiles: [deviceProfile],
      deletedDeviceProfiles: [],
      tags: [],
      deletedTags: [],
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
      trustedDevices: [
        {
          id: deviceId,
          publicKeys: {
            signingKey: deviceSignKeyPair.publicKey,
          },
        },
      ],
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
      devicePublicSignKey: deviceSignKeyPair.publicKey,
      protectedLocalKeys,
    };

    const localVaultDescriptor: LocalVaultDescriptor = {
      vaultId,
      displayName: vaultDisplayName,
      createdAt: timestamp,
    };

    const unlockedVault: UnlockedVault = {
      vaultId,
      deviceId,
      vault,
      vaultMasterKey,
      devicePrivateSignKey: deviceSignKeyPair.privateKey,
    };

    await this.vaultLocalRepository.saveInitializedLocalVault(
      localVaultDescriptor,
      deviceAccessMaterial,
      vaultSnapshot,
    );
    try {
      await this.unlockedVaultSession.commit(
        unlockedVault,
        vaultSnapshot.metadata.revision,
      );
    } catch (error) {
      try {
        await this.vaultLocalRepository.removePersistedLocalVault(vaultId);
      } catch {
        // Preserve the session activation failure as the root cause.
      }

      throw error;
    }

    return {
      recoveryMnemonicKey,
      vaultDisplayName,
    };
  }
}
