import type { LocalKeysPayload } from "../../domain/device-trust/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
import { vaultLockDelayMsSchema } from "../../domain/scheduled-task/scheduled-task-delay.schema";
import type { VaultLockDelayMs } from "../../domain/scheduled-task/scheduled-task-delay.type";
import type { DeviceKeySlot } from "../../domain/snapshot/key-slot";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { VisibleVaultFields } from "../../domain/vault";
import { toVisibleVaultFields } from "../../domain/vault/visible-vault.mapper";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { IdPort } from "../../ports/system/id.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceAccessMaterialNotFoundError,
  DeviceKeySlotNotFoundError,
  DeviceKeySlotVerificationFailedError,
  VaultSnapshotNotFoundError,
} from "../../errors/unlock-vault.errors";
import { InvalidVaultLockDelayError } from "../../errors/vault-session.errors";
import { PersistedVaultMismatchError } from "../../errors/vault-snapshot.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import { LocalVaultTrustCheckpointNotFoundError } from "../../errors/vault-trust.errors";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";

export type UnlockVaultCommandParams = {
  vaultId: string;
  masterPassword: RawMasterPassword;
  lockAfterMs: VaultLockDelayMs;
};

export type UnlockVaultResult = {
  readonly vaultId: string;
  readonly deviceId: string;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
  readonly vault: VisibleVaultFields;
};

export class UnlockVaultUseCase {
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;
  private readonly ids: IdPort;
  private readonly scheduledTasks: ScheduledTaskPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly vaultLockTasks: VaultLockTaskRepositoryPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    clock: ClockPort,
    crypto: CryptoPort,
    ids: IdPort,
    scheduledTasks: ScheduledTaskPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
    vaultLockTasks: VaultLockTaskRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
  ) {
    this.clock = clock;
    this.crypto = crypto;
    this.ids = ids;
    this.scheduledTasks = scheduledTasks;
    this.vaultLocalRepository = vaultLocalRepository;
    this.vaultLockTasks = vaultLockTasks;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async execute(params: UnlockVaultCommandParams): Promise<UnlockVaultResult> {
    const lockDelayResult = vaultLockDelayMsSchema.safeParse(
      params.lockAfterMs,
    );

    if (!lockDelayResult.success) {
      throw new InvalidVaultLockDelayError(lockDelayResult.error);
    }

    const activationGeneration =
      await this.unlockedVaultSession.requireVaultCanBeActivated(
        params.vaultId,
      );

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

    if (vaultSnapshot.metadata.id !== params.vaultId) {
      throw new PersistedVaultMismatchError(
        params.vaultId,
        vaultSnapshot.metadata.id,
      );
    }

    const deviceKeySlot = vaultSnapshot.keySlots.deviceSlots.find(
      (slot: DeviceKeySlot) => slot.deviceId === deviceAccessMaterial.deviceId,
    );

    if (deviceKeySlot === undefined) {
      throw new DeviceKeySlotNotFoundError(
        params.vaultId,
        deviceAccessMaterial.deviceId,
      );
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
    const doesDeviceSigningKeyMatchMaterial =
      await this.crypto.verifyDeviceSignKeyPair(
        deviceAccessMaterial.devicePublicSignKey,
        localKeysPayload.devicePrivateSignKey,
      );
    const doesDeviceVaultKeyMatchMaterial =
      await this.crypto.verifyDeviceVaultKeyPair(
        deviceAccessMaterial.devicePublicVaultKey,
        localKeysPayload.devicePrivateVaultKey,
      );

    if (
      !doesDeviceSigningKeyMatchMaterial ||
      !doesDeviceVaultKeyMatchMaterial
    ) {
      throw new DeviceKeySlotVerificationFailedError(
        params.vaultId,
        deviceAccessMaterial.deviceId,
      );
    }

    const localDeviceIdentity = {
      deviceId: deviceAccessMaterial.deviceId,
      publicSignKey: deviceAccessMaterial.devicePublicSignKey,
      publicVaultKey: deviceAccessMaterial.devicePublicVaultKey,
    };
    const checkpoint =
      await this.vaultLocalRepository.getLocalVaultTrustCheckpoint(
        params.vaultId,
      );

    if (checkpoint === null) {
      throw new LocalVaultTrustCheckpointNotFoundError(params.vaultId);
    }

    await this.vaultTrust.verifyCheckpoint(
      params.vaultId,
      checkpoint,
      localDeviceIdentity,
    );
    const verifiedTrust = await this.vaultTrust.verifyTrustChain(
      params.vaultId,
      localKeysPayload.vaultTrustAnchor,
      this.requireTrustChain(params.vaultId, vaultSnapshot),
    );
    const trustedLocalDevice = verifiedTrust.trustedDevices.find(
      (device) => device.deviceId === deviceAccessMaterial.deviceId,
    );

    if (
      trustedLocalDevice === undefined ||
      !(await this.crypto.verifyDeviceSignKeyPair(
        trustedLocalDevice.publicSignKey,
        localKeysPayload.devicePrivateSignKey,
      )) ||
      !(await this.crypto.verifyDeviceVaultKeyPair(
        trustedLocalDevice.publicVaultKey,
        localKeysPayload.devicePrivateVaultKey,
      ))
    ) {
      throw new VaultTrustStateInvalidError(
        params.vaultId,
        "local device is not trusted",
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
        deviceId: deviceAccessMaterial.deviceId,
        vaultKeyGeneration: vaultSnapshot.metadata.vaultKeyGeneration,
        algorithmSuiteId: vaultSnapshot.metadata.algorithmSuiteId,
      },
    );

    const vault = await this.crypto.decryptVaultSnapshotContent(
      vaultSnapshot.content,
      vaultMasterKey,
    );

    const snapshotDigest = await this.crypto.digestVaultSnapshot(vaultSnapshot);

    if (checkpointRelation === "newer") {
      await this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
        expectedSnapshotDigest: snapshotDigest,
        snapshot: vaultSnapshot,
        checkpoint: await this.vaultTrust.createCheckpoint(
          vaultSnapshot,
          verifiedTrust,
          deviceAccessMaterial.deviceId,
          localKeysPayload.devicePrivateSignKey,
        ),
      });
    }

    const unlockedVault: UnlockedVault = {
      vaultId: params.vaultId,
      deviceId: deviceAccessMaterial.deviceId,
      vault,
      vaultMasterKey,
      devicePrivateSignKey: localKeysPayload.devicePrivateSignKey,
      devicePrivateVaultKey: localKeysPayload.devicePrivateVaultKey,
      deviceLocalProtectionKey: localKeysPayload.deviceLocalProtectionKey,
      trustedSnapshotContext: {
        snapshotDigest,
        trust: verifiedTrust,
      },
      vaultTrustAnchor: localKeysPayload.vaultTrustAnchor,
    };

    const lockVaultActionId = await this.ids.generateId();
    const lockScheduledAt = this.clock.now() + params.lockAfterMs;

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
      await this.unlockedVaultSession.activate(
        activationGeneration,
        unlockedVault,
        vaultSnapshot.metadata.snapshotVersionVector,
      );
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
      vaultId: params.vaultId,
      deviceId: deviceAccessMaterial.deviceId,
      snapshotVersionVector: {
        ...vaultSnapshot.metadata.snapshotVersionVector,
      },
      revisionTimestamp: vaultSnapshot.metadata.revisionTimestamp,
      vault: toVisibleVaultFields(vault),
    };
  }

  private requireTrustChain(
    vaultId: string,
    snapshot: VaultSnapshot,
  ): NonNullable<VaultSnapshot["trustChain"]> {
    if (snapshot.metadata.schemaVersion !== 1) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "unsupported snapshot schema version",
      );
    }

    if (snapshot.trustChain === undefined) {
      throw new VaultTrustStateInvalidError(vaultId, "trust chain is missing");
    }

    return snapshot.trustChain;
  }
}
