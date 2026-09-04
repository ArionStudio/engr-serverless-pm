import type {
  DeviceAccessMaterial,
  DeviceAccessRecoveryBackup,
  EncryptedDeviceSyncCredentialState,
  LocalVaultDescriptor,
  LocalVaultTrustCheckpoint,
  PendingDeviceEnrollment,
  VaultLocalRepositoryPort,
  VaultSnapshot,
  CryptoPort,
} from "@lfspm/core";
import {
  areJsonEqual,
  DeviceAccessMaterialChangedError,
  LocalVaultAlreadyInitializedError,
  LocalVaultSnapshotChangedError,
} from "@lfspm/core";
import Dexie from "dexie";
import {
  db,
  type PersistedVaultArtifactRecord,
  type VaultManagerDb,
} from "../../infrastructure/database/dexie-db";
import { exactRecord } from "../codecs/artifact-codec.primitives";
import {
  WebCryptoAsymmetricKeyValidator,
  WebCryptoAdapter,
  validateVaultSnapshotPublicKeys,
  type AsymmetricKeyValidator,
} from "../crypto";
import {
  decodeDeviceAccessMaterial,
  decodeDeviceAccessRecoveryBackup,
  decodeLocalVaultDescriptor,
  decodeLocalVaultTrustCheckpoint,
  encodeDeviceAccessMaterial,
  encodeDeviceAccessRecoveryBackup,
  encodeLocalVaultDescriptor,
  encodeLocalVaultTrustCheckpoint,
  InvalidLocalVaultSecurityRecordError,
} from "../codecs/local-vault-security.codec";
import {
  decodePendingDeviceEnrollment,
  encodePendingDeviceEnrollment,
  InvalidDeviceEnrollmentArtifactError,
} from "../codecs/device-enrollment-artifact.codec";
import {
  decodeEncryptedDeviceSyncCredentialState,
  encodeEncryptedDeviceSyncCredentialState,
  InvalidSyncCredentialRecordError,
} from "../codecs/sync-credential.codec";
import {
  decodeVaultSnapshot,
  encodeVaultSnapshot,
  InvalidLocalVaultSnapshotRecordError,
} from "../codecs/vault-snapshot.codec";

const INITIAL_DEVICE_ACCESS_REVISION = 1;

function areEncryptedSyncCredentialStatesEqual(
  left: EncryptedDeviceSyncCredentialState | null,
  right: EncryptedDeviceSyncCredentialState | null,
): boolean {
  if (left === null || right === null) {
    return left === null && right === null;
  }

  return (
    left.ciphertext === right.ciphertext &&
    left.encryptionNonce === right.encryptionNonce
  );
}

type ErrorConstructor = new () => Error;

export class IndexedDbVaultLocalRepositoryAdapter implements VaultLocalRepositoryPort {
  private readonly database: VaultManagerDb;
  private readonly asymmetricKeyValidator: AsymmetricKeyValidator;
  private readonly snapshotDigester: Pick<CryptoPort, "digestVaultSnapshot">;

  constructor(
    database: VaultManagerDb = db,
    asymmetricKeyValidator: AsymmetricKeyValidator = new WebCryptoAsymmetricKeyValidator(),
    snapshotDigester: Pick<
      CryptoPort,
      "digestVaultSnapshot"
    > = new WebCryptoAdapter(),
  ) {
    this.database = database;
    this.asymmetricKeyValidator = asymmetricKeyValidator;
    this.snapshotDigester = snapshotDigester;
  }

  async saveInitializedLocalVault(params: {
    readonly descriptor: LocalVaultDescriptor;
    readonly deviceAccessMaterial: DeviceAccessMaterial;
    readonly deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup;
    readonly snapshot: VaultSnapshot;
    readonly checkpoint: LocalVaultTrustCheckpoint;
    readonly syncCredentialState?: EncryptedDeviceSyncCredentialState;
  }): Promise<void> {
    const vaultId = params.descriptor.vaultId;

    if (
      params.deviceAccessMaterial.revision !== INITIAL_DEVICE_ACCESS_REVISION ||
      params.deviceAccessRecoveryBackup.revision !==
        INITIAL_DEVICE_ACCESS_REVISION ||
      !areDeviceAccessRecordsConsistent(
        params.deviceAccessMaterial,
        params.deviceAccessRecoveryBackup,
      )
    ) {
      throw new DeviceAccessMaterialChangedError(vaultId);
    }

    if (
      params.deviceAccessMaterial.vaultId !== vaultId ||
      params.checkpoint.payload.vaultId !== vaultId ||
      params.checkpoint.payload.deviceId !==
        params.deviceAccessMaterial.deviceId
    ) {
      throw new InvalidLocalVaultSecurityRecordError();
    }

    if (params.snapshot.metadata.id !== vaultId) {
      throw new InvalidLocalVaultSnapshotRecordError();
    }

    const descriptorArtifact = encodeLocalVaultDescriptor(params.descriptor);
    const materialArtifact = encodeDeviceAccessMaterial(
      params.deviceAccessMaterial,
    );
    const backupArtifact = encodeDeviceAccessRecoveryBackup(
      params.deviceAccessRecoveryBackup,
    );
    const snapshotArtifact = encodeVaultSnapshot(params.snapshot);
    const checkpointArtifact = encodeLocalVaultTrustCheckpoint(
      params.checkpoint,
    );
    const syncCredentialArtifact =
      params.syncCredentialState === undefined
        ? undefined
        : encodeEncryptedDeviceSyncCredentialState(params.syncCredentialState);

    await this.database.transaction(
      "rw",
      [
        this.database.localVaultDescriptors,
        this.database.deviceAccessMaterials,
        this.database.deviceAccessRecoveryBackups,
        this.database.vaultSnapshots,
        this.database.localVaultTrustCheckpoints,
        this.database.deviceSyncCredentialStates,
      ],
      async () => {
        const existingRecords = await Promise.all([
          this.database.localVaultDescriptors.get(vaultId),
          this.database.deviceAccessMaterials.get(vaultId),
          this.database.deviceAccessRecoveryBackups.get(vaultId),
          this.database.vaultSnapshots.get(vaultId),
          this.database.localVaultTrustCheckpoints.get(vaultId),
          this.database.deviceSyncCredentialStates.get(vaultId),
        ]);

        if (existingRecords.some((record) => record !== undefined)) {
          throw new LocalVaultAlreadyInitializedError(vaultId);
        }

        await Promise.all([
          this.database.localVaultDescriptors.put(
            storedVaultArtifact(vaultId, descriptorArtifact),
          ),
          this.database.deviceAccessMaterials.put(
            storedVaultArtifact(vaultId, materialArtifact),
          ),
          this.database.deviceAccessRecoveryBackups.put(
            storedVaultArtifact(vaultId, backupArtifact),
          ),
          this.database.vaultSnapshots.put(
            storedVaultArtifact(vaultId, snapshotArtifact),
          ),
          this.database.localVaultTrustCheckpoints.put(
            storedVaultArtifact(vaultId, checkpointArtifact),
          ),
          ...(syncCredentialArtifact === undefined
            ? []
            : [
                this.database.deviceSyncCredentialStates.put(
                  storedVaultArtifact(vaultId, syncCredentialArtifact),
                ),
              ]),
        ]);
      },
    );
  }

  async removePersistedLocalVault(vaultId: string): Promise<void> {
    await this.database.transaction(
      "rw",
      [
        this.database.localVaultDescriptors,
        this.database.deviceAccessMaterials,
        this.database.deviceAccessRecoveryBackups,
        this.database.vaultSnapshots,
        this.database.localVaultTrustCheckpoints,
        this.database.deviceSyncCredentialStates,
      ],
      async () => {
        await this.removeVaultRecords(vaultId);
      },
    );
  }

  async removePersistedLocalVaultIfArtifactsMatch(
    params: Parameters<
      VaultLocalRepositoryPort["removePersistedLocalVaultIfArtifactsMatch"]
    >[0],
  ): Promise<boolean> {
    const { vaultId } = params;
    const expectedDescriptorArtifact = encodeLocalVaultDescriptor(
      params.expectedDescriptor,
    );
    const expectedMaterialArtifact = encodeDeviceAccessMaterial(
      params.expectedDeviceAccessMaterial,
    );
    const expectedBackupArtifact = encodeDeviceAccessRecoveryBackup(
      params.expectedDeviceAccessRecoveryBackup,
    );

    return this.database.transaction(
      "rw",
      [
        this.database.localVaultDescriptors,
        this.database.deviceAccessMaterials,
        this.database.deviceAccessRecoveryBackups,
        this.database.vaultSnapshots,
        this.database.localVaultTrustCheckpoints,
        this.database.deviceSyncCredentialStates,
      ],
      async () => {
        const [
          descriptorRecord,
          materialRecord,
          backupRecord,
          snapshotRecord,
          checkpointRecord,
          syncCredentialRecord,
        ] = await Promise.all([
          this.database.localVaultDescriptors.get(vaultId),
          this.database.deviceAccessMaterials.get(vaultId),
          this.database.deviceAccessRecoveryBackups.get(vaultId),
          this.database.vaultSnapshots.get(vaultId),
          this.database.localVaultTrustCheckpoints.get(vaultId),
          this.database.deviceSyncCredentialStates.get(vaultId),
        ]);

        if (
          descriptorRecord === undefined ||
          materialRecord === undefined ||
          backupRecord === undefined ||
          snapshotRecord === undefined ||
          checkpointRecord === undefined
        ) {
          return false;
        }

        const descriptorArtifact = storedVaultArtifactValue(
          descriptorRecord,
          vaultId,
          InvalidLocalVaultSecurityRecordError,
        );
        const materialArtifact = storedVaultArtifactValue(
          materialRecord,
          vaultId,
          InvalidLocalVaultSecurityRecordError,
        );
        const backupArtifact = storedVaultArtifactValue(
          backupRecord,
          vaultId,
          InvalidLocalVaultSecurityRecordError,
        );

        const snapshot = await this.decodeAndValidateVaultSnapshot(
          storedVaultArtifactValue(
            snapshotRecord,
            vaultId,
            InvalidLocalVaultSnapshotRecordError,
          ),
        );
        const checkpoint = decodeLocalVaultTrustCheckpoint(
          storedVaultArtifactValue(
            checkpointRecord,
            vaultId,
            InvalidLocalVaultSecurityRecordError,
          ),
        );
        const currentSnapshotDigest = await Dexie.waitFor(
          this.snapshotDigester.digestVaultSnapshot(snapshot),
        );
        const currentSyncCredentialState =
          syncCredentialRecord === undefined
            ? null
            : decodeEncryptedDeviceSyncCredentialState(
                storedVaultArtifactValue(
                  syncCredentialRecord,
                  vaultId,
                  InvalidSyncCredentialRecordError,
                ),
              );

        if (
          snapshot.metadata.id !== vaultId ||
          checkpoint.payload.vaultId !== vaultId ||
          !areJsonEqual(descriptorArtifact, expectedDescriptorArtifact) ||
          !areJsonEqual(materialArtifact, expectedMaterialArtifact) ||
          !areJsonEqual(backupArtifact, expectedBackupArtifact) ||
          currentSnapshotDigest !== params.expectedSnapshotDigest ||
          checkpoint.payload.snapshotDigest !== params.expectedSnapshotDigest ||
          !areJsonEqual(checkpoint, params.expectedCheckpoint) ||
          !areEncryptedSyncCredentialStatesEqual(
            currentSyncCredentialState,
            params.expectedSyncCredentialState,
          )
        ) {
          return false;
        }

        await this.removeVaultRecords(vaultId);
        return true;
      },
    );
  }

  async saveLocalVaultDescriptor(
    descriptor: LocalVaultDescriptor,
  ): Promise<void> {
    await this.database.localVaultDescriptors.put(
      storedVaultArtifact(
        descriptor.vaultId,
        encodeLocalVaultDescriptor(descriptor),
      ),
    );
  }

  async getLocalVaultDescriptor(
    vaultId: string,
  ): Promise<LocalVaultDescriptor | null> {
    const record = await this.database.localVaultDescriptors.get(vaultId);

    if (record === undefined) {
      return null;
    }

    const descriptor = decodeLocalVaultDescriptor(
      storedVaultArtifactValue(
        record,
        vaultId,
        InvalidLocalVaultSecurityRecordError,
      ),
    );
    requireMatchingVaultId(
      descriptor.vaultId,
      vaultId,
      InvalidLocalVaultSecurityRecordError,
    );
    return descriptor;
  }

  async listLocalVaultDescriptors(): Promise<LocalVaultDescriptor[]> {
    const records = await this.database.localVaultDescriptors.toArray();

    return records.map((record) => {
      const artifact = storedVaultArtifactValue(
        record,
        record.vaultId,
        InvalidLocalVaultSecurityRecordError,
      );
      const descriptor = decodeLocalVaultDescriptor(artifact);
      requireMatchingVaultId(
        descriptor.vaultId,
        record.vaultId,
        InvalidLocalVaultSecurityRecordError,
      );
      return descriptor;
    });
  }

  async removeLocalVaultDescriptor(vaultId: string): Promise<void> {
    await this.database.localVaultDescriptors.delete(vaultId);
  }

  async saveDeviceAccessRecords(
    params: Parameters<VaultLocalRepositoryPort["saveDeviceAccessRecords"]>[0],
  ): Promise<void> {
    const { deviceAccessMaterial, deviceAccessRecoveryBackup } = params;
    const vaultId = deviceAccessMaterial.vaultId;

    if (
      !areDeviceAccessRecordsConsistent(
        deviceAccessMaterial,
        deviceAccessRecoveryBackup,
      )
    ) {
      throw new DeviceAccessMaterialChangedError(vaultId);
    }

    const materialArtifact = encodeDeviceAccessMaterial(deviceAccessMaterial);
    const backupArtifact = encodeDeviceAccessRecoveryBackup(
      deviceAccessRecoveryBackup,
    );

    await this.database.transaction(
      "rw",
      this.database.deviceAccessMaterials,
      this.database.deviceAccessRecoveryBackups,
      async () => {
        const [materialRecord, backupRecord] = await Promise.all([
          this.database.deviceAccessMaterials.get(vaultId),
          this.database.deviceAccessRecoveryBackups.get(vaultId),
        ]);
        const currentMaterial =
          materialRecord === undefined
            ? null
            : await this.decodeDeviceAccessMaterialRecord(
                materialRecord,
                vaultId,
              );
        const currentBackup =
          backupRecord === undefined
            ? null
            : await this.decodeDeviceAccessRecoveryBackupRecord(
                backupRecord,
                vaultId,
              );

        if (
          !isValidDeviceAccessReplacement(
            params,
            currentMaterial,
            currentBackup,
          )
        ) {
          throw new DeviceAccessMaterialChangedError(vaultId);
        }

        await Promise.all([
          this.database.deviceAccessMaterials.put(
            storedVaultArtifact(vaultId, materialArtifact),
          ),
          this.database.deviceAccessRecoveryBackups.put(
            storedVaultArtifact(vaultId, backupArtifact),
          ),
        ]);
      },
    );
  }

  async getDeviceAccessRecords(vaultId: string): Promise<{
    readonly deviceAccessMaterial: DeviceAccessMaterial | null;
    readonly deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup | null;
  }> {
    return this.database.transaction(
      "r",
      this.database.deviceAccessMaterials,
      this.database.deviceAccessRecoveryBackups,
      async () => {
        const [materialRecord, backupRecord] = await Promise.all([
          this.database.deviceAccessMaterials.get(vaultId),
          this.database.deviceAccessRecoveryBackups.get(vaultId),
        ]);

        const deviceAccessMaterial =
          materialRecord === undefined
            ? null
            : await this.decodeDeviceAccessMaterialRecord(
                materialRecord,
                vaultId,
              );
        const deviceAccessRecoveryBackup =
          backupRecord === undefined
            ? null
            : await this.decodeDeviceAccessRecoveryBackupRecord(
                backupRecord,
                vaultId,
              );

        if (
          deviceAccessMaterial !== null &&
          deviceAccessRecoveryBackup !== null &&
          !areDeviceAccessRecordsConsistent(
            deviceAccessMaterial,
            deviceAccessRecoveryBackup,
          )
        ) {
          throw new InvalidLocalVaultSecurityRecordError();
        }

        return { deviceAccessMaterial, deviceAccessRecoveryBackup };
      },
    );
  }

  async getDeviceAccessMaterial(
    vaultId: string,
  ): Promise<DeviceAccessMaterial | null> {
    const record = await this.database.deviceAccessMaterials.get(vaultId);
    return record === undefined
      ? null
      : this.decodeDeviceAccessMaterialRecord(record, vaultId);
  }

  async removeDeviceAccessMaterial(vaultId: string): Promise<void> {
    await this.database.deviceAccessMaterials.delete(vaultId);
  }

  async getDeviceAccessRecoveryBackup(
    vaultId: string,
  ): Promise<DeviceAccessRecoveryBackup | null> {
    const record = await this.database.deviceAccessRecoveryBackups.get(vaultId);
    return record === undefined
      ? null
      : this.decodeDeviceAccessRecoveryBackupRecord(record, vaultId);
  }

  async removeDeviceAccessRecoveryBackup(vaultId: string): Promise<void> {
    await this.database.deviceAccessRecoveryBackups.delete(vaultId);
  }

  async getVaultSnapshot(vaultId: string): Promise<VaultSnapshot | null> {
    const record = await this.database.vaultSnapshots.get(vaultId);

    if (record === undefined) {
      return null;
    }

    const snapshot = await this.decodeAndValidateVaultSnapshot(
      storedVaultArtifactValue(
        record,
        vaultId,
        InvalidLocalVaultSnapshotRecordError,
      ),
    );
    requireMatchingVaultId(
      snapshot.metadata.id,
      vaultId,
      InvalidLocalVaultSnapshotRecordError,
    );
    return snapshot;
  }

  async removeVaultSnapshot(vaultId: string): Promise<void> {
    await this.database.vaultSnapshots.delete(vaultId);
  }

  async saveVaultSnapshotWithCheckpoint(
    params: Parameters<
      VaultLocalRepositoryPort["saveVaultSnapshotWithCheckpoint"]
    >[0],
  ): Promise<void> {
    const vaultId = params.snapshot.metadata.id;

    if (params.checkpoint.payload.vaultId !== vaultId) {
      throw new InvalidLocalVaultSecurityRecordError();
    }

    const snapshotArtifact = encodeVaultSnapshot(params.snapshot);
    const checkpointArtifact = encodeLocalVaultTrustCheckpoint(
      params.checkpoint,
    );
    const syncCredentialArtifact =
      params.syncCredentialState === undefined ||
      params.syncCredentialState === null
        ? params.syncCredentialState
        : encodeEncryptedDeviceSyncCredentialState(params.syncCredentialState);
    const replacesSyncCredentialState =
      params.syncCredentialState !== undefined;
    const hasSyncCredentialState = Object.hasOwn(params, "syncCredentialState");
    const hasExpectedSyncCredentialState = Object.hasOwn(
      params,
      "expectedSyncCredentialState",
    );

    if (
      hasSyncCredentialState !== replacesSyncCredentialState ||
      hasExpectedSyncCredentialState !== replacesSyncCredentialState ||
      (replacesSyncCredentialState &&
        params.expectedSyncCredentialState === undefined)
    ) {
      throw new InvalidLocalVaultSecurityRecordError();
    }

    await this.database.transaction(
      "rw",
      this.database.vaultSnapshots,
      this.database.localVaultTrustCheckpoints,
      this.database.deviceSyncCredentialStates,
      async () => {
        const [snapshotRecord, checkpointRecord, syncCredentialRecord] =
          await Promise.all([
            this.database.vaultSnapshots.get(vaultId),
            this.database.localVaultTrustCheckpoints.get(vaultId),
            replacesSyncCredentialState
              ? this.database.deviceSyncCredentialStates.get(vaultId)
              : Promise.resolve(undefined),
          ]);

        if (snapshotRecord === undefined || checkpointRecord === undefined) {
          throw new LocalVaultSnapshotChangedError(vaultId);
        }

        const currentSnapshot = await this.decodeAndValidateVaultSnapshot(
          storedVaultArtifactValue(
            snapshotRecord,
            vaultId,
            InvalidLocalVaultSnapshotRecordError,
          ),
        );
        const currentCheckpoint = decodeLocalVaultTrustCheckpoint(
          storedVaultArtifactValue(
            checkpointRecord,
            vaultId,
            InvalidLocalVaultSecurityRecordError,
          ),
        );
        const currentSnapshotDigest = await Dexie.waitFor(
          this.snapshotDigester.digestVaultSnapshot(currentSnapshot),
        );
        const currentSyncCredentialState =
          syncCredentialRecord === undefined
            ? null
            : decodeEncryptedDeviceSyncCredentialState(
                storedVaultArtifactValue(
                  syncCredentialRecord,
                  vaultId,
                  InvalidSyncCredentialRecordError,
                ),
              );

        if (
          currentSnapshot.metadata.id !== vaultId ||
          currentCheckpoint.payload.vaultId !== vaultId ||
          currentSnapshotDigest !== params.expectedSnapshotDigest ||
          !areJsonEqual(currentCheckpoint, params.expectedCheckpoint) ||
          (replacesSyncCredentialState &&
            !areEncryptedSyncCredentialStatesEqual(
              currentSyncCredentialState,
              params.expectedSyncCredentialState ?? null,
            ))
        ) {
          throw new LocalVaultSnapshotChangedError(vaultId);
        }

        await Promise.all([
          this.database.vaultSnapshots.put(
            storedVaultArtifact(vaultId, snapshotArtifact),
          ),
          this.database.localVaultTrustCheckpoints.put(
            storedVaultArtifact(vaultId, checkpointArtifact),
          ),
          ...(syncCredentialArtifact === undefined
            ? []
            : syncCredentialArtifact === null
              ? [this.database.deviceSyncCredentialStates.delete(vaultId)]
              : [
                  this.database.deviceSyncCredentialStates.put(
                    storedVaultArtifact(vaultId, syncCredentialArtifact),
                  ),
                ]),
        ]);
      },
    );
  }

  async getLocalVaultTrustCheckpoint(
    vaultId: string,
  ): Promise<LocalVaultTrustCheckpoint | null> {
    const record = await this.database.localVaultTrustCheckpoints.get(vaultId);

    if (record === undefined) {
      return null;
    }

    const checkpoint = decodeLocalVaultTrustCheckpoint(
      storedVaultArtifactValue(
        record,
        vaultId,
        InvalidLocalVaultSecurityRecordError,
      ),
    );
    requireMatchingVaultId(
      checkpoint.payload.vaultId,
      vaultId,
      InvalidLocalVaultSecurityRecordError,
    );
    return checkpoint;
  }

  async removeLocalVaultTrustCheckpoint(vaultId: string): Promise<void> {
    await this.database.localVaultTrustCheckpoints.delete(vaultId);
  }

  async saveDeviceSyncCredentialState(
    vaultId: string,
    state: EncryptedDeviceSyncCredentialState,
  ): Promise<void> {
    await this.database.deviceSyncCredentialStates.put(
      storedVaultArtifact(
        vaultId,
        encodeEncryptedDeviceSyncCredentialState(state),
      ),
    );
  }

  async getDeviceSyncCredentialState(
    vaultId: string,
  ): Promise<EncryptedDeviceSyncCredentialState | null> {
    const record = await this.database.deviceSyncCredentialStates.get(vaultId);

    if (record === undefined) {
      return null;
    }

    return decodeEncryptedDeviceSyncCredentialState(
      storedVaultArtifactValue(
        record,
        vaultId,
        InvalidSyncCredentialRecordError,
      ),
    );
  }

  async removeDeviceSyncCredentialState(vaultId: string): Promise<void> {
    await this.database.deviceSyncCredentialStates.delete(vaultId);
  }

  async savePendingDeviceEnrollment(
    enrollment: PendingDeviceEnrollment,
  ): Promise<void> {
    await this.database.pendingDeviceEnrollments.put({
      requestId: enrollment.requestId,
      artifact: encodePendingDeviceEnrollment(enrollment),
    });
  }

  async getPendingDeviceEnrollment(
    requestId: string,
  ): Promise<PendingDeviceEnrollment | null> {
    const record = await this.database.pendingDeviceEnrollments.get(requestId);

    if (record === undefined) {
      return null;
    }

    const enrollment = decodePendingDeviceEnrollment(
      storedPendingEnrollmentArtifactValue(record, requestId),
    );

    if (enrollment.requestId !== requestId) {
      throw new InvalidDeviceEnrollmentArtifactError();
    }

    return enrollment;
  }

  async removePendingDeviceEnrollment(requestId: string): Promise<void> {
    await this.database.pendingDeviceEnrollments.delete(requestId);
  }

  private async decodeDeviceAccessMaterialRecord(
    record: PersistedVaultArtifactRecord,
    vaultId: string,
  ): Promise<DeviceAccessMaterial> {
    const material = decodeDeviceAccessMaterial(
      storedVaultArtifactValue(
        record,
        vaultId,
        InvalidLocalVaultSecurityRecordError,
      ),
    );
    requireMatchingVaultId(
      material.vaultId,
      vaultId,
      InvalidLocalVaultSecurityRecordError,
    );
    await this.validateDeviceAccessPublicKeys(
      material.devicePublicSignKey,
      material.devicePublicVaultKey,
    );
    return material;
  }

  private async decodeDeviceAccessRecoveryBackupRecord(
    record: PersistedVaultArtifactRecord,
    vaultId: string,
  ): Promise<DeviceAccessRecoveryBackup> {
    const backup = decodeDeviceAccessRecoveryBackup(
      storedVaultArtifactValue(
        record,
        vaultId,
        InvalidLocalVaultSecurityRecordError,
      ),
    );
    requireMatchingVaultId(
      backup.vaultId,
      vaultId,
      InvalidLocalVaultSecurityRecordError,
    );
    await this.validateDeviceAccessPublicKeys(
      backup.devicePublicSignKey,
      backup.devicePublicVaultKey,
    );
    return backup;
  }

  private async decodeAndValidateVaultSnapshot(
    artifact: unknown,
  ): Promise<VaultSnapshot> {
    const snapshot = decodeVaultSnapshot(artifact, "local");

    try {
      await Dexie.waitFor(
        validateVaultSnapshotPublicKeys(snapshot, this.asymmetricKeyValidator),
      );
    } catch {
      throw new InvalidLocalVaultSnapshotRecordError();
    }

    return snapshot;
  }

  private async validateDeviceAccessPublicKeys(
    publicSignKey: DeviceAccessMaterial["devicePublicSignKey"],
    publicVaultKey: DeviceAccessMaterial["devicePublicVaultKey"],
  ): Promise<void> {
    try {
      await Dexie.waitFor(
        Promise.all([
          this.asymmetricKeyValidator.importDeviceSignPublicKey(publicSignKey),
          this.asymmetricKeyValidator.importDeviceVaultPublicKey(
            publicVaultKey,
          ),
        ]),
      );
    } catch {
      throw new InvalidLocalVaultSecurityRecordError();
    }
  }

  private async removeVaultRecords(vaultId: string): Promise<void> {
    await Promise.all([
      this.database.localVaultDescriptors.delete(vaultId),
      this.database.deviceAccessMaterials.delete(vaultId),
      this.database.deviceAccessRecoveryBackups.delete(vaultId),
      this.database.vaultSnapshots.delete(vaultId),
      this.database.localVaultTrustCheckpoints.delete(vaultId),
      this.database.deviceSyncCredentialStates.delete(vaultId),
    ]);
  }
}

function storedVaultArtifact(
  vaultId: string,
  artifact: unknown,
): PersistedVaultArtifactRecord {
  return { vaultId, artifact };
}

function storedVaultArtifactValue(
  record: unknown,
  expectedVaultId: string,
  ErrorType: ErrorConstructor,
): unknown {
  try {
    const stored = exactRecord(record, ["artifact", "vaultId"]);
    if (stored.vaultId !== expectedVaultId) {
      throw new Error("vault identity");
    }
    return stored.artifact;
  } catch {
    throw new ErrorType();
  }
}

function storedPendingEnrollmentArtifactValue(
  record: unknown,
  expectedRequestId: string,
): unknown {
  try {
    const stored = exactRecord(record, ["artifact", "requestId"]);
    if (stored.requestId !== expectedRequestId) {
      throw new Error("request identity");
    }
    return stored.artifact;
  } catch {
    throw new InvalidDeviceEnrollmentArtifactError();
  }
}

function requireMatchingVaultId(
  actualVaultId: string,
  expectedVaultId: string,
  ErrorType: ErrorConstructor,
): void {
  if (actualVaultId !== expectedVaultId) {
    throw new ErrorType();
  }
}

function isValidDeviceAccessReplacement(
  params: Parameters<VaultLocalRepositoryPort["saveDeviceAccessRecords"]>[0],
  currentMaterial: DeviceAccessMaterial | null,
  currentBackup: DeviceAccessRecoveryBackup | null,
): boolean {
  const expectsAbsentMaterial =
    params.expectedDeviceAccessMaterialRevision === null &&
    params.expectedDeviceAccessMaterialGenerationId === null;
  const hasSplitMaterialExpectation =
    (params.expectedDeviceAccessMaterialRevision === null) !==
    (params.expectedDeviceAccessMaterialGenerationId === null);
  const nextMaterialRevision =
    params.expectedDeviceAccessMaterialRevision === null
      ? INITIAL_DEVICE_ACCESS_REVISION
      : nextDeviceAccessRevision(params.expectedDeviceAccessMaterialRevision);
  const nextBackupRevision = nextDeviceAccessRevision(
    params.expectedDeviceAccessRecoveryBackupRevision,
  );
  const currentMaterialMatchesExpected =
    currentMaterial === null
      ? params.expectedDeviceAccessMaterialRevision === null &&
        params.expectedDeviceAccessMaterialGenerationId === null
      : currentMaterial.revision ===
          params.expectedDeviceAccessMaterialRevision &&
        currentMaterial.localAccessGenerationId ===
          params.expectedDeviceAccessMaterialGenerationId;

  return (
    !hasSplitMaterialExpectation &&
    currentBackup !== null &&
    (currentMaterial === null) === expectsAbsentMaterial &&
    nextMaterialRevision !== null &&
    nextBackupRevision !== null &&
    isNonEmptyString(params.expectedDeviceAccessRecoveryBackupGenerationId) &&
    (params.expectedDeviceAccessMaterialGenerationId === null ||
      isNonEmptyString(params.expectedDeviceAccessMaterialGenerationId)) &&
    currentMaterialMatchesExpected &&
    currentBackup.revision ===
      params.expectedDeviceAccessRecoveryBackupRevision &&
    currentBackup.localAccessGenerationId ===
      params.expectedDeviceAccessRecoveryBackupGenerationId &&
    (currentMaterial === null ||
      areDeviceAccessRecordsConsistent(currentMaterial, currentBackup)) &&
    areDeviceAccessRecordsConsistent(
      params.deviceAccessMaterial,
      params.deviceAccessRecoveryBackup,
    ) &&
    haveSameDeviceAccessIdentity(
      currentBackup,
      params.deviceAccessRecoveryBackup,
    ) &&
    params.deviceAccessMaterial.revision === nextMaterialRevision &&
    params.deviceAccessRecoveryBackup.revision === nextBackupRevision &&
    params.deviceAccessMaterial.localAccessGenerationId !==
      currentBackup.localAccessGenerationId &&
    (currentMaterial === null ||
      params.deviceAccessMaterial.localAccessGenerationId !==
        currentMaterial.localAccessGenerationId)
  );
}

function nextDeviceAccessRevision(currentRevision: number): number | null {
  return Number.isSafeInteger(currentRevision) &&
    currentRevision >= INITIAL_DEVICE_ACCESS_REVISION &&
    currentRevision < Number.MAX_SAFE_INTEGER
    ? currentRevision + 1
    : null;
}

function areDeviceAccessRecordsConsistent(
  material: DeviceAccessMaterial,
  backup: DeviceAccessRecoveryBackup,
): boolean {
  return (
    haveSameDeviceAccessIdentity(material, backup) &&
    isNonEmptyString(material.localAccessGenerationId) &&
    material.localAccessGenerationId === backup.localAccessGenerationId
  );
}

function haveSameDeviceAccessIdentity(
  left: DeviceAccessMaterial | DeviceAccessRecoveryBackup,
  right: DeviceAccessMaterial | DeviceAccessRecoveryBackup,
): boolean {
  return (
    isNonEmptyString(left.vaultId) &&
    isNonEmptyString(left.deviceId) &&
    isNonEmptyString(left.algorithmSuiteId) &&
    left.vaultId === right.vaultId &&
    left.deviceId === right.deviceId &&
    left.algorithmSuiteId === right.algorithmSuiteId &&
    areArrayBuffersEqual(left.devicePublicSignKey, right.devicePublicSignKey) &&
    areArrayBuffersEqual(left.devicePublicVaultKey, right.devicePublicVaultKey)
  );
}

function areArrayBuffersEqual(left: unknown, right: unknown): boolean {
  if (!(left instanceof ArrayBuffer) || !(right instanceof ArrayBuffer)) {
    return false;
  }

  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return leftBytes.every((byte, index) => byte === rightBytes[index]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
