import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { LocalKeysPayload } from "../../domain/device-trust/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { Vault } from "../../domain/vault/vault";
import { resetDeviceProfilesToRecoveredDevice } from "../../domain/vault/vault-device.mutations";
import { removeVaultSyncConfig } from "../../domain/vault/vault-sync-config.mutations";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../errors/unlock-vault.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { incrementVersionVector } from "../../domain/versioning/version-vector.utils";

export type RecoverVaultAccessCommandParams = {
  readonly vaultId: string;
  readonly recoveryMnemonicKey: RecoveryKeyMnemonic;
  readonly newMasterPassword: RawMasterPassword;
  readonly deviceName: string;
};

export type RecoverVaultAccessResult = {
  readonly vault: Vault;
};

export class RecoverVaultAccessUseCase {
  private readonly bip39: Bip39Port;
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    bip39: Bip39Port,
    clock: ClockPort,
    crypto: CryptoPort,
    ids: IdPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.bip39 = bip39;
    this.clock = clock;
    this.crypto = crypto;
    this.ids = ids;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultLocalRepository = vaultLocalRepository;
  }

  async execute(
    params: RecoverVaultAccessCommandParams,
  ): Promise<RecoverVaultAccessResult> {
    // Validate that this recovery can safely use the local snapshot as its
    // source of truth.
    // Recovery activates this vault locally, so it must not replace another
    // already-unlocked vault session.
    await this.unlockedVaultSession.requireVaultCanBeActivated(params.vaultId);

    // Start from the local encrypted snapshot. Sync credentials are inside the
    // encrypted vault content, so recovery cannot download first.
    const currentVaultSnapshot =
      await this.vaultLocalRepository.getVaultSnapshot(params.vaultId);

    if (currentVaultSnapshot === null) {
      throw new VaultSnapshotNotFoundError(params.vaultId);
    }

    if (
      currentVaultSnapshot.metadata.algorithmSuiteId !==
      this.crypto.algorithmSuite.id
    ) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId: params.vaultId,
        artifact: "vault snapshot",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: currentVaultSnapshot.metadata.algorithmSuiteId,
      });
    }

    const signerDevice = currentVaultSnapshot.keySlots.deviceSlots.find(
      (deviceSlot) =>
        deviceSlot.deviceId === currentVaultSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        params.vaultId,
        currentVaultSnapshot.metadata.createdByDeviceId,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      currentVaultSnapshot,
      signerDevice.publicSignKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(params.vaultId);
    }

    // The recovery mnemonic unlocks the vault master key through the snapshot's
    // recovery slot, then the vault content can be decrypted.
    const recoverySecretKey = await this.bip39.mnemonicToRecoveryKey(
      params.recoveryMnemonicKey,
    );
    const recoveryVaultMasterKeyProtectionKey =
      await this.crypto.deriveRecoveryVaultMasterKeyProtectionKey(
        recoverySecretKey,
      );
    const vaultMasterKey = await this.crypto.unwrapVaultMasterKey(
      currentVaultSnapshot.keySlots.recoveryKeySlot.protectedVaultMasterKey,
      recoveryVaultMasterKeyProtectionKey,
    );
    const vault = await this.crypto.decryptVaultSnapshotContent(
      currentVaultSnapshot.content,
      vaultMasterKey,
    );

    // Provision a fresh local device identity for this recovered installation.
    const deviceId = await this.ids.generateId();
    const timestamp = this.clock.now();
    const deviceSlotKey = await this.crypto.generateDeviceSlotKey();
    const deviceSignKeyPair = await this.crypto.generateDeviceSignKeyPair();

    // Protect the new local device keys with the new local unlock password.
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

    const localKeysPayload: LocalKeysPayload = {
      deviceSlotKey,
      devicePrivateSignKey: deviceSignKeyPair.privateKey,
    };
    const protectedLocalKeys = await this.crypto.wrapLocalKeysPayload(
      localKeysPayload,
      localKeysProtectionKey,
    );

    // Create a new device slot so future unlocks on this device use normal
    // local access material instead of the recovery mnemonic.
    const deviceSlotVaultMasterKeyProtectionKey =
      await this.crypto.deriveDeviceSlotVaultMasterKeyProtectionKey(
        deviceSlotKey,
      );
    const protectedDeviceVaultMasterKey = await this.crypto.wrapVaultMasterKey(
      vaultMasterKey,
      deviceSlotVaultMasterKeyProtectionKey,
    );

    // Recovery intentionally creates a new local-only trust root.
    const recoveredVault = removeVaultSyncConfig(
      resetDeviceProfilesToRecoveredDevice(
        vault,
        deviceId,
        params.deviceName,
        timestamp,
      ),
    );

    // Update snapshot device access state and sign as the recovered device. Snapshot
    // trust/key-slot changes live outside encrypted vault content.
    const unsignedVaultSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        ...currentVaultSnapshot.metadata,
        id: params.vaultId,
        revisionTimestamp: timestamp,
        snapshotVersionVector: incrementVersionVector(
          currentVaultSnapshot.metadata.snapshotVersionVector,
          deviceId,
        ),
        createdByDeviceId: deviceId,
      },
      keySlots: {
        deviceSlots: [
          {
            deviceId,
            protectedVaultMasterKey: protectedDeviceVaultMasterKey,
            publicSignKey: deviceSignKeyPair.publicKey,
          },
        ],
        recoveryKeySlot: currentVaultSnapshot.keySlots.recoveryKeySlot,
        completedEnrollments:
          currentVaultSnapshot.keySlots.completedEnrollments,
      },
      content: await this.crypto.encryptVaultSnapshotContent(
        recoveredVault,
        vaultMasterKey,
      ),
    };

    const recoveredVaultSnapshot: VaultSnapshot = {
      ...unsignedVaultSnapshot,
      signature: await this.crypto.signVaultSnapshot(
        unsignedVaultSnapshot,
        deviceSignKeyPair.privateKey,
      ),
    };

    // Prepare the local records needed for future unlocks and the currently
    // unlocked runtime session.
    const deviceAccessMaterial: DeviceAccessMaterial = {
      vaultId: params.vaultId,
      deviceId,
      algorithmSuiteId: this.crypto.algorithmSuite.id,
      masterPasswordSalt,
      localKeysProtectionSalt,
      devicePublicSignKey: deviceSignKeyPair.publicKey,
      protectedLocalKeys,
    };

    const unlockedVault: UnlockedVault = {
      vaultId: params.vaultId,
      deviceId,
      vault: recoveredVault,
      vaultMasterKey,
      devicePrivateSignKey: deviceSignKeyPair.privateKey,
    };

    // Persist the recovered snapshot and matching local access material as one
    // local repository operation before exposing the unlocked session.
    await this.vaultLocalRepository.saveRecoveredLocalVault(
      deviceAccessMaterial,
      recoveredVaultSnapshot,
    );
    await this.unlockedVaultSession.commit(
      unlockedVault,
      recoveredVaultSnapshot.metadata.snapshotVersionVector,
    );

    return {
      vault: recoveredVault,
    };
  }
}
