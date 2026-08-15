import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust/device-access-recovery-backup";
import { INITIAL_DEVICE_ACCESS_REVISION } from "../../domain/device-trust/device-access-revision";
import { isValidLocalAccessGenerationId } from "../../domain/device-trust/device-access-records";
import type { DeviceProfile } from "../../domain/device-profile/device-profile";
import type { LocalKeysPayload } from "../../domain/device-trust/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
import { assertNewMasterPasswordMeetsPolicy } from "../../domain/master-password/master-password.utils";
import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { DeviceVaultKeyEnvelopeContext } from "../../domain/snapshot";
import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { Vault } from "../../domain/vault/vault";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type { VaultDisplayNamePort } from "../../ports/vault/vault-display-name.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { VaultLockDelayMs } from "../../domain/scheduled-task/scheduled-task-delay.type";
import { VaultSessionActivationService } from "../../services/session/vault-session-activation.service";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import { DeviceAccessMaterialChangedError } from "../../errors/vault-device.errors";

export type InitializeVaultCommandParams = {
  masterPassword: RawMasterPassword;
  deviceName: string;
  lockAfterMs: VaultLockDelayMs;
};

export type InitializeVaultResult = {
  recoveryMnemonicKey: RecoveryKeyMnemonic;
  vaultDisplayName: string;
};

export class InitializeVaultUseCase {
  private readonly bip39: Bip39Port;
  private readonly crypto: CryptoPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly ids: IdPort;
  private readonly clock: ClockPort;
  private readonly vaultDisplayName: VaultDisplayNamePort;
  private readonly vaultTrust: VaultTrustService;
  private readonly sessionActivation: VaultSessionActivationService;

  constructor(
    crypto: CryptoPort,
    bip39: Bip39Port,
    vaultLocalRepository: VaultLocalRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    ids: IdPort,
    clock: ClockPort,
    vaultDisplayName: VaultDisplayNamePort,
    scheduledTasks: ScheduledTaskPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
  ) {
    this.crypto = crypto;
    this.bip39 = bip39;
    this.vaultLocalRepository = vaultLocalRepository;
    this.unlockedVaultSession = unlockedVaultSession;
    this.ids = ids;
    this.clock = clock;
    this.vaultDisplayName = vaultDisplayName;
    this.vaultTrust = new VaultTrustService(crypto);
    this.sessionActivation = new VaultSessionActivationService(
      clock,
      ids,
      scheduledTasks,
      vaultLockTasks,
      unlockedVaultSession,
    );
  }

  async execute(
    initializeVaultCommandParams: InitializeVaultCommandParams,
  ): Promise<InitializeVaultResult> {
    const lockAfterMs = this.sessionActivation.requireValidLockDelay(
      initializeVaultCommandParams.lockAfterMs,
    );
    assertNewMasterPasswordMeetsPolicy(
      initializeVaultCommandParams.masterPassword,
    );
    const vaultId = await this.ids.generateId();
    const activationGeneration =
      await this.unlockedVaultSession.requireVaultCanBeActivated(vaultId);

    const deviceId = await this.ids.generateId();
    const localAccessGenerationId = await this.ids.generateId();

    if (!isValidLocalAccessGenerationId(localAccessGenerationId)) {
      throw new DeviceAccessMaterialChangedError(vaultId);
    }
    const timestamp = this.clock.now();
    const vaultDisplayName =
      await this.vaultDisplayName.generateVaultDisplayName();
    const ephemeralSecrets: ArrayBuffer[] = [];
    const sessionSecrets: ArrayBuffer[] = [];
    let sessionActivated = false;

    try {
      const vaultMasterKey = await this.crypto.generateVaultMasterKey();
      sessionSecrets.push(vaultMasterKey);
      const deviceSignKeyPair = await this.crypto.generateDeviceSignKeyPair();
      sessionSecrets.push(deviceSignKeyPair.privateKey);
      const deviceVaultKeyPair = await this.crypto.generateDeviceVaultKeyPair();
      sessionSecrets.push(deviceVaultKeyPair.privateKey);
      const deviceLocalProtectionKey =
        await this.crypto.generateDeviceLocalProtectionKey();
      sessionSecrets.push(deviceLocalProtectionKey);
      const vaultKeyGeneration = 1;
      const genesisTrust = await this.vaultTrust.createGenesis(
        vaultId,
        {
          deviceId,
          publicSignKey: deviceSignKeyPair.publicKey,
          publicVaultKey: deviceVaultKeyPair.publicKey,
        },
        vaultKeyGeneration,
        deviceSignKeyPair.privateKey,
      );
      const recoverySecretKey = await this.crypto.generateRecoveryKey();
      ephemeralSecrets.push(recoverySecretKey);
      const recoveryMnemonicKey =
        await this.bip39.recoveryKeyToMnemonic(recoverySecretKey);

      const masterPasswordSalt = await this.crypto.generateMasterPasswordSalt();
      const localRootKey = await this.crypto.deriveLocalRootKey(
        initializeVaultCommandParams.masterPassword,
        masterPasswordSalt,
      );
      ephemeralSecrets.push(localRootKey);

      const localKeysProtectionSalt =
        await this.crypto.generateLocalKeysProtectionSalt();

      const localKeysProtectionKey =
        await this.crypto.deriveLocalKeysProtectionKey(
          localRootKey,
          localKeysProtectionSalt,
        );
      ephemeralSecrets.push(localKeysProtectionKey);

      const localKeysPayload: LocalKeysPayload = {
        devicePrivateSignKey: deviceSignKeyPair.privateKey,
        devicePrivateVaultKey: deviceVaultKeyPair.privateKey,
        deviceLocalProtectionKey,
        vaultTrustAnchor: genesisTrust.anchor,
      };

      const protectedLocalKeys = await this.crypto.wrapLocalKeysPayload(
        localKeysPayload,
        localKeysProtectionKey,
      );
      const recoveryLocalKeysProtectionSalt =
        await this.crypto.generateRecoveryLocalKeysProtectionSalt();
      const recoveryLocalKeysProtectionKey =
        await this.crypto.deriveRecoveryLocalKeysProtectionKey(
          recoverySecretKey,
          recoveryLocalKeysProtectionSalt,
        );
      ephemeralSecrets.push(recoveryLocalKeysProtectionKey);
      const recoveryProtectedLocalKeys = await this.crypto.wrapLocalKeysPayload(
        localKeysPayload,
        recoveryLocalKeysProtectionKey,
      );

      const envelopeContext: DeviceVaultKeyEnvelopeContext = {
        vaultId,
        deviceId,
        vaultKeyGeneration,
        algorithmSuiteId: this.crypto.algorithmSuite.id,
      };
      const deviceVaultKeyEnvelope =
        await this.crypto.createDeviceVaultKeyEnvelope(
          vaultMasterKey,
          deviceVaultKeyPair.publicKey,
          envelopeContext,
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
          snapshotVersionVector: {
            [deviceId]: 1,
          },
          algorithmSuiteId: this.crypto.algorithmSuite.id,
          createdByDeviceId: deviceId,
          vaultKeyGeneration,
        },
        trustChain: genesisTrust.chain,
        keySlots: {
          deviceSlots: [
            {
              deviceId,
              vaultKeyGeneration,
              envelope: deviceVaultKeyEnvelope,
            },
          ],
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
        revision: INITIAL_DEVICE_ACCESS_REVISION,
        localAccessGenerationId,
        vaultId,
        deviceId,
        algorithmSuiteId: this.crypto.algorithmSuite.id,
        masterPasswordSalt,
        localKeysProtectionSalt,
        devicePublicSignKey: deviceSignKeyPair.publicKey,
        devicePublicVaultKey: deviceVaultKeyPair.publicKey,
        protectedLocalKeys,
      };
      const deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup = {
        revision: INITIAL_DEVICE_ACCESS_REVISION,
        localAccessGenerationId,
        vaultId,
        deviceId,
        algorithmSuiteId: this.crypto.algorithmSuite.id,
        recoveryLocalKeysProtectionSalt,
        devicePublicSignKey: deviceSignKeyPair.publicKey,
        devicePublicVaultKey: deviceVaultKeyPair.publicKey,
        protectedLocalKeys: recoveryProtectedLocalKeys,
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
        devicePrivateVaultKey: deviceVaultKeyPair.privateKey,
        deviceLocalProtectionKey,
        trustedSnapshotContext: {
          snapshotDigest: await this.crypto.digestVaultSnapshot(vaultSnapshot),
          trust: genesisTrust.trust,
        },
        vaultTrustAnchor: genesisTrust.anchor,
      };
      const checkpoint = await this.vaultTrust.createCheckpoint(
        vaultSnapshot,
        genesisTrust.trust,
        deviceId,
        deviceSignKeyPair.privateKey,
      );

      await this.sessionActivation.activate({
        activationGeneration,
        unlockedVault,
        sourceSnapshotVersionVector:
          vaultSnapshot.metadata.snapshotVersionVector,
        lockAfterMs,
        prepareActivation: async () =>
          this.vaultLocalRepository.saveInitializedLocalVault({
            descriptor: localVaultDescriptor,
            deviceAccessMaterial,
            deviceAccessRecoveryBackup,
            snapshot: vaultSnapshot,
            checkpoint,
          }),
        rollbackPreparedActivation: async () => {
          await this.vaultLocalRepository.removePersistedLocalVaultIfSnapshotMatches(
            vaultId,
            unlockedVault.trustedSnapshotContext.snapshotDigest,
          );
        },
      });
      sessionActivated = true;

      return {
        recoveryMnemonicKey,
        vaultDisplayName,
      };
    } finally {
      bestEffortWipeArrayBuffers(ephemeralSecrets);

      if (!sessionActivated) {
        bestEffortWipeArrayBuffers(sessionSecrets);
      }
    }
  }
}
