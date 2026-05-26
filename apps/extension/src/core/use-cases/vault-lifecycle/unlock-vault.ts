import type { LocalKeysPayload } from "../../domain/local-protection/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
import { vaultLockDelayMsSchema } from "../../domain/scheduled-task/scheduled-task-delay.schema";
import type { VaultLockDelayMs } from "../../domain/scheduled-task/scheduled-task-delay.type";
import type { DeviceKeySlot } from "../../domain/snapshot/key-slot";
import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import type { Vault } from "../../domain/vault/vault";
import type { ClockPort } from "../../ports/clock.port";
import type { CryptoPort } from "../../ports/crypto.port";
import type { IdPort } from "../../ports/id.port";
import type { ScheduledTaskPort } from "../../ports/scheduled-task.port";
import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault-local-repository.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault-lock-task-repository.port";
import { UnsupportedAlgorithmSuiteError } from "../__errors/algorithm-suite.errors";
import {
  DeviceAccessMaterialNotFoundError,
  DeviceKeySlotNotFoundError,
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../__errors/unlock-vault.errors";
import { InvalidVaultLockDelayError } from "../__errors/vault-session.errors";

export type UnlockVaultCommandParams = {
  vaultId: string;
  masterPassword: RawMasterPassword;
  lockAfterMs: VaultLockDelayMs;
};

export type UnlockVaultResult = {
  vault: Vault;
};

export class UnlockVaultUseCase {
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;
  private readonly scheduledTasks: ScheduledTaskPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly vaultLockTasks: VaultLockTaskRepositoryPort;
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    ids: IdPort,
    scheduledTasks: ScheduledTaskPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.ids = ids;
    this.scheduledTasks = scheduledTasks;
    this.vaultLocalRepository = vaultLocalRepository;
    this.vaultLockTasks = vaultLockTasks;
    this.unlockedVaultRepository = unlockedVaultRepository;
  }

  async execute(params: UnlockVaultCommandParams): Promise<UnlockVaultResult> {
    assertValidVaultLockDelay(params.lockAfterMs);

    const deviceAccessMaterial =
      await this.vaultLocalRepository.getDeviceAccessMaterial(params.vaultId);

    if (deviceAccessMaterial === null) {
      throw new DeviceAccessMaterialNotFoundError(params.vaultId);
    }

    const vaultSnapshot = await this.vaultLocalRepository.getVaultSnapshot(
      params.vaultId,
    );

    if (vaultSnapshot === null) {
      throw new VaultSnapshotNotFoundError(params.vaultId);
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

    const signerDevice = vaultSnapshot.trustedDevices.find(
      (device) => device.id === vaultSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        params.vaultId,
        vaultSnapshot.metadata.createdByDeviceId,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      vaultSnapshot,
      signerDevice.publicKeys.signingKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(params.vaultId);
    }

    const localRootKey = await this.crypto.deriveLocalRootKey(
      params.masterPassword,
      deviceAccessMaterial.masterPasswordSalt,
    );

    const localKeysProtectionKey =
      await this.crypto.deriveLocalKeysProtectionKey(
        localRootKey,
        deviceAccessMaterial.localKeysProtectionSalt,
      );

    const localKeysPayload: LocalKeysPayload =
      await this.crypto.unwrapLocalKeysPayload(
        deviceAccessMaterial.protectedLocalKeys,
        localKeysProtectionKey,
      );

    const deviceKeySlot = vaultSnapshot.keySlots.deviceSlots.find(
      (slot: DeviceKeySlot) => slot.deviceId === deviceAccessMaterial.deviceId,
    );

    if (deviceKeySlot === undefined) {
      throw new DeviceKeySlotNotFoundError(
        params.vaultId,
        deviceAccessMaterial.deviceId,
      );
    }

    const vaultMasterKeyProtectionKey =
      await this.crypto.deriveDeviceSlotVaultMasterKeyProtectionKey(
        localKeysPayload.deviceSlotKey,
      );

    const vaultMasterKey = await this.crypto.unwrapVaultMasterKey(
      deviceKeySlot.protectedVaultMasterKey,
      vaultMasterKeyProtectionKey,
    );

    const vault = await this.crypto.decryptVaultSnapshotContent(
      vaultSnapshot.content,
      vaultMasterKey,
    );

    const lockVaultActionId = await this.ids.generateId();
    const lockScheduledAt = this.clock.now() + params.lockAfterMs;

    const unlockedVault: UnlockedVault = {
      vaultId: params.vaultId,
      deviceId: deviceAccessMaterial.deviceId,
      vault,
      vaultMasterKey,
      devicePrivateSignKey: localKeysPayload.devicePrivateSignKey,
    };

    const lockVaultTask = {
      name: "lockVault",
      actionId: lockVaultActionId,
    } as const;

    await this.vaultLockTasks.save({
      actionId: lockVaultActionId,
      vaultId: params.vaultId,
      expiresAt: lockScheduledAt,
    });

    try {
      await this.scheduledTasks.scheduleTask({
        task: lockVaultTask,
        runAt: lockScheduledAt,
      });
    } catch (error) {
      try {
        await this.vaultLockTasks.remove();
      } catch {
        // Preserve the schedule failure.
      }
      throw error;
    }

    try {
      await this.unlockedVaultRepository.saveUnlockedVault(unlockedVault);
    } catch (error) {
      try {
        await this.scheduledTasks.cancelTask(lockVaultTask);
      } catch {
        // Preserve the save failure; repository cleanup still needs to run.
      }
      try {
        await this.vaultLockTasks.remove();
      } catch {
        // Preserve the save failure.
      }
      throw error;
    }

    return {
      vault,
    };
  }
}

function assertValidVaultLockDelay(lockAfterMs: number): void {
  const lockDelayResult = vaultLockDelayMsSchema.safeParse(lockAfterMs);

  if (!lockDelayResult.success) {
    throw new InvalidVaultLockDelayError(lockDelayResult.error);
  }
}
