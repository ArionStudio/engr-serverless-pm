import "fake-indexeddb/auto";
import type {
  DeviceAccessMaterial,
  DeviceAccessRecoveryBackup,
  DevicePublicSignKey,
  DeviceVaultPublicKey,
  EncryptedDeviceSyncCredentialState,
  LocalVaultDescriptor,
  LocalVaultTrustCheckpoint,
  PendingDeviceEnrollment,
  VaultSnapshot,
} from "@lfspm/core";
import {
  DeviceAccessMaterialChangedError,
  LocalVaultAlreadyInitializedError,
  LocalVaultSnapshotChangedError,
} from "@lfspm/core";
import { encodeBase64Url } from "@lfspm/core/lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createVaultManagerDb,
  type PersistedPendingDeviceEnrollmentRecord,
  type PersistedVaultArtifactRecord,
  type VaultManagerDb,
} from "../../infrastructure/database/dexie-db";
import type { AsymmetricKeyValidator } from "../crypto";
import { IndexedDbVaultLocalRepository } from "./indexeddb-vault-local.repository";
import { InvalidDeviceEnrollmentArtifactError } from "../codecs/device-enrollment-artifact.codec";
import { InvalidLocalVaultSecurityRecordError } from "../codecs/local-vault-security.codec";
import { InvalidSyncCredentialRecordError } from "../codecs/sync-credential.codec";
import { encodeVaultSnapshot } from "../codecs/vault-snapshot.codec";

let databaseCounter = 0;
let database: VaultManagerDb | undefined;

function createContext() {
  databaseCounter += 1;
  database = createVaultManagerDb(`lfspm-vault-repository-${databaseCounter}`);
  const artifacts = createArtifacts();
  const snapshotDigester = {
    digestVaultSnapshot: vi.fn(async (snapshot: VaultSnapshot) =>
      snapshotDigest(snapshot.metadata.snapshotVersionVector["device-1"] ?? 0),
    ),
  };

  return {
    artifacts,
    database,
    snapshotDigester,
    repository: new IndexedDbVaultLocalRepository(
      database,
      createNoOpAsymmetricKeyValidator(),
      snapshotDigester,
    ),
  };
}

afterEach(async () => {
  await database?.delete();
  database = undefined;
});

describe("IndexedDbVaultLocalRepository", () => {
  it("persists and reads an initialized vault as one complete record set", async () => {
    const ctx = createContext();

    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);

    await expect(
      ctx.repository.getLocalVaultDescriptor(ctx.artifacts.descriptor.vaultId),
    ).resolves.toEqual(ctx.artifacts.descriptor);
    await expect(ctx.repository.listLocalVaultDescriptors()).resolves.toEqual([
      ctx.artifacts.descriptor,
    ]);
    await expect(
      ctx.repository.getDeviceAccessRecords(ctx.artifacts.descriptor.vaultId),
    ).resolves.toEqual({
      deviceAccessMaterial: ctx.artifacts.deviceAccessMaterial,
      deviceAccessRecoveryBackup: ctx.artifacts.deviceAccessRecoveryBackup,
    });
    await expect(
      ctx.repository.getVaultSnapshot(ctx.artifacts.descriptor.vaultId),
    ).resolves.toEqual(ctx.artifacts.snapshot);
    await expect(
      ctx.repository.getLocalVaultTrustCheckpoint(
        ctx.artifacts.descriptor.vaultId,
      ),
    ).resolves.toEqual(ctx.artifacts.checkpoint);
    await expect(
      ctx.repository.getDeviceSyncCredentialState(
        ctx.artifacts.descriptor.vaultId,
      ),
    ).resolves.toEqual(ctx.artifacts.syncCredentialState);
  });

  it("rejects initialization over any existing vault record without partial writes", async () => {
    const ctx = createContext();
    await ctx.repository.saveLocalVaultDescriptor(ctx.artifacts.descriptor);

    await expect(
      ctx.repository.saveInitializedLocalVault(ctx.artifacts),
    ).rejects.toBeInstanceOf(LocalVaultAlreadyInitializedError);

    await expect(ctx.database.localVaultDescriptors.count()).resolves.toBe(1);
    await expect(ctx.database.deviceAccessMaterials.count()).resolves.toBe(0);
    await expect(
      ctx.database.deviceAccessRecoveryBackups.count(),
    ).resolves.toBe(0);
    await expect(ctx.database.vaultSnapshots.count()).resolves.toBe(0);
    await expect(ctx.database.localVaultTrustCheckpoints.count()).resolves.toBe(
      0,
    );
    await expect(ctx.database.deviceSyncCredentialStates.count()).resolves.toBe(
      0,
    );
  });

  it("rolls back every initialized record when an IndexedDB write fails", async () => {
    const ctx = createContext();
    ctx.database.vaultSnapshots.hook("creating", () => {
      throw new Error("snapshot write failed");
    });

    await expect(
      ctx.repository.saveInitializedLocalVault(ctx.artifacts),
    ).rejects.toThrow("snapshot write failed");

    await expect(ctx.database.localVaultDescriptors.count()).resolves.toBe(0);
    await expect(ctx.database.deviceAccessMaterials.count()).resolves.toBe(0);
    await expect(
      ctx.database.deviceAccessRecoveryBackups.count(),
    ).resolves.toBe(0);
    await expect(ctx.database.vaultSnapshots.count()).resolves.toBe(0);
    await expect(ctx.database.localVaultTrustCheckpoints.count()).resolves.toBe(
      0,
    );
    await expect(ctx.database.deviceSyncCredentialStates.count()).resolves.toBe(
      0,
    );
  });

  it("atomically compares and replaces the access-material pair", async () => {
    const ctx = createContext();
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);
    const replacement = createReplacementAccessRecords(ctx.artifacts, 2);

    await ctx.repository.saveDeviceAccessRecords({
      expectedDeviceAccessMaterialRevision: 1,
      expectedDeviceAccessMaterialGenerationId: "generation-1",
      expectedDeviceAccessRecoveryBackupRevision: 1,
      expectedDeviceAccessRecoveryBackupGenerationId: "generation-1",
      ...replacement,
    });

    await expect(
      ctx.repository.getDeviceAccessRecords(ctx.artifacts.descriptor.vaultId),
    ).resolves.toEqual(replacement);

    const staleReplacement = createReplacementAccessRecords(ctx.artifacts, 3);
    await expect(
      ctx.repository.saveDeviceAccessRecords({
        expectedDeviceAccessMaterialRevision: 1,
        expectedDeviceAccessMaterialGenerationId: "generation-1",
        expectedDeviceAccessRecoveryBackupRevision: 1,
        expectedDeviceAccessRecoveryBackupGenerationId: "generation-1",
        ...staleReplacement,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialChangedError);
    await expect(
      ctx.repository.getDeviceAccessRecords(ctx.artifacts.descriptor.vaultId),
    ).resolves.toEqual(replacement);
  });

  it("rejects a mismatched replacement pair before changing either access record", async () => {
    const ctx = createContext();
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);
    const replacement = createReplacementAccessRecords(ctx.artifacts, 2);

    await expect(
      ctx.repository.saveDeviceAccessRecords({
        expectedDeviceAccessMaterialRevision: 1,
        expectedDeviceAccessMaterialGenerationId: "generation-1",
        expectedDeviceAccessRecoveryBackupRevision: 1,
        expectedDeviceAccessRecoveryBackupGenerationId: "generation-1",
        deviceAccessMaterial: replacement.deviceAccessMaterial,
        deviceAccessRecoveryBackup: {
          ...replacement.deviceAccessRecoveryBackup,
          deviceId: "another-device",
        },
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialChangedError);

    await expect(
      ctx.repository.getDeviceAccessRecords(ctx.artifacts.descriptor.vaultId),
    ).resolves.toEqual({
      deviceAccessMaterial: ctx.artifacts.deviceAccessMaterial,
      deviceAccessRecoveryBackup: ctx.artifacts.deviceAccessRecoveryBackup,
    });
  });

  it("creates access material at revision one when recovery finds it absent", async () => {
    const ctx = createContext();
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);
    await ctx.repository.removeDeviceAccessMaterial(
      ctx.artifacts.descriptor.vaultId,
    );
    const replacement = createReplacementAccessRecords(ctx.artifacts, 2);

    await ctx.repository.saveDeviceAccessRecords({
      expectedDeviceAccessMaterialRevision: null,
      expectedDeviceAccessMaterialGenerationId: null,
      expectedDeviceAccessRecoveryBackupRevision: 1,
      expectedDeviceAccessRecoveryBackupGenerationId: "generation-1",
      deviceAccessMaterial: {
        ...replacement.deviceAccessMaterial,
        revision: 1,
      },
      deviceAccessRecoveryBackup: replacement.deviceAccessRecoveryBackup,
    });

    await expect(
      ctx.repository.getDeviceAccessRecords(ctx.artifacts.descriptor.vaultId),
    ).resolves.toMatchObject({
      deviceAccessMaterial: {
        revision: 1,
        localAccessGenerationId: "generation-2",
      },
      deviceAccessRecoveryBackup: {
        revision: 2,
        localAccessGenerationId: "generation-2",
      },
    });
  });

  it("atomically compares snapshot digest and replaces snapshot, checkpoint, and credentials", async () => {
    const ctx = createContext();
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);
    const nextSnapshot = createNextSnapshot(ctx.artifacts.snapshot, 2);
    const nextCheckpoint = createNextCheckpoint(ctx.artifacts.checkpoint, 2);

    await ctx.repository.saveVaultSnapshotWithCheckpoint({
      expectedSnapshotDigest: snapshotDigest(1),
      snapshot: nextSnapshot,
      checkpoint: nextCheckpoint,
      syncCredentialState: null,
    });

    await expect(
      ctx.repository.getVaultSnapshot(ctx.artifacts.descriptor.vaultId),
    ).resolves.toEqual(nextSnapshot);
    await expect(
      ctx.repository.getLocalVaultTrustCheckpoint(
        ctx.artifacts.descriptor.vaultId,
      ),
    ).resolves.toEqual(nextCheckpoint);
    await expect(
      ctx.repository.getDeviceSyncCredentialState(
        ctx.artifacts.descriptor.vaultId,
      ),
    ).resolves.toBeNull();

    await expect(
      ctx.repository.saveVaultSnapshotWithCheckpoint({
        expectedSnapshotDigest: snapshotDigest(1),
        snapshot: createNextSnapshot(ctx.artifacts.snapshot, 3),
        checkpoint: createNextCheckpoint(ctx.artifacts.checkpoint, 3),
      }),
    ).rejects.toBeInstanceOf(LocalVaultSnapshotChangedError);
    await expect(
      ctx.repository.getVaultSnapshot(ctx.artifacts.descriptor.vaultId),
    ).resolves.toEqual(nextSnapshot);
    await expect(
      ctx.repository.getLocalVaultTrustCheckpoint(
        ctx.artifacts.descriptor.vaultId,
      ),
    ).resolves.toEqual(nextCheckpoint);
  });

  it("conditionally removes all vault records only for the current checkpoint digest", async () => {
    const ctx = createContext();
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);

    await expect(
      ctx.repository.removePersistedLocalVaultIfSnapshotMatches(
        ctx.artifacts.descriptor.vaultId,
        snapshotDigest(99),
      ),
    ).resolves.toBe(false);
    await expect(ctx.database.vaultSnapshots.count()).resolves.toBe(1);

    await expect(
      ctx.repository.removePersistedLocalVaultIfSnapshotMatches(
        ctx.artifacts.descriptor.vaultId,
        snapshotDigest(1),
      ),
    ).resolves.toBe(true);
    await expect(ctx.database.localVaultDescriptors.count()).resolves.toBe(0);
    await expect(ctx.database.deviceAccessMaterials.count()).resolves.toBe(0);
    await expect(
      ctx.database.deviceAccessRecoveryBackups.count(),
    ).resolves.toBe(0);
    await expect(ctx.database.vaultSnapshots.count()).resolves.toBe(0);
    await expect(ctx.database.localVaultTrustCheckpoints.count()).resolves.toBe(
      0,
    );
    await expect(ctx.database.deviceSyncCredentialStates.count()).resolves.toBe(
      0,
    );
  });

  it("does not remove when the snapshot changed but the checkpoint claim did not", async () => {
    const ctx = createContext();
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);
    const substitutedSnapshot = createNextSnapshot(ctx.artifacts.snapshot, 99);
    await ctx.database.vaultSnapshots.put({
      vaultId: ctx.artifacts.descriptor.vaultId,
      artifact: encodeVaultSnapshot(substitutedSnapshot),
    });

    await expect(
      ctx.repository.removePersistedLocalVaultIfSnapshotMatches(
        ctx.artifacts.descriptor.vaultId,
        snapshotDigest(1),
      ),
    ).resolves.toBe(false);
    await expect(ctx.database.vaultSnapshots.count()).resolves.toBe(1);
    await expect(ctx.database.localVaultDescriptors.count()).resolves.toBe(1);
  });

  it("does not overwrite when the snapshot changed but the checkpoint claim did not", async () => {
    const ctx = createContext();
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);
    const substitutedSnapshot = createNextSnapshot(ctx.artifacts.snapshot, 99);
    await ctx.database.vaultSnapshots.put({
      vaultId: ctx.artifacts.descriptor.vaultId,
      artifact: encodeVaultSnapshot(substitutedSnapshot),
    });

    await expect(
      ctx.repository.saveVaultSnapshotWithCheckpoint({
        expectedSnapshotDigest: snapshotDigest(1),
        snapshot: createNextSnapshot(ctx.artifacts.snapshot, 2),
        checkpoint: createNextCheckpoint(ctx.artifacts.checkpoint, 2),
      }),
    ).rejects.toBeInstanceOf(LocalVaultSnapshotChangedError);
    await expect(
      ctx.repository.getVaultSnapshot(ctx.artifacts.descriptor.vaultId),
    ).resolves.toEqual(substitutedSnapshot);
    await expect(
      ctx.repository.getLocalVaultTrustCheckpoint(
        ctx.artifacts.descriptor.vaultId,
      ),
    ).resolves.toEqual(ctx.artifacts.checkpoint);
  });

  it("exposes all individual save, read, and idempotent remove operations", async () => {
    const ctx = createContext();
    const vaultId = ctx.artifacts.descriptor.vaultId;
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);
    await ctx.repository.savePendingDeviceEnrollment(
      ctx.artifacts.pendingDeviceEnrollment,
    );

    await expect(
      ctx.repository.getDeviceAccessMaterial(vaultId),
    ).resolves.toEqual(ctx.artifacts.deviceAccessMaterial);
    await expect(
      ctx.repository.getDeviceAccessRecoveryBackup(vaultId),
    ).resolves.toEqual(ctx.artifacts.deviceAccessRecoveryBackup);
    await expect(
      ctx.repository.getPendingDeviceEnrollment("request-1"),
    ).resolves.toEqual(ctx.artifacts.pendingDeviceEnrollment);

    await Promise.all([
      ctx.repository.removeLocalVaultDescriptor(vaultId),
      ctx.repository.removeDeviceAccessMaterial(vaultId),
      ctx.repository.removeDeviceAccessRecoveryBackup(vaultId),
      ctx.repository.removeVaultSnapshot(vaultId),
      ctx.repository.removeLocalVaultTrustCheckpoint(vaultId),
      ctx.repository.removeDeviceSyncCredentialState(vaultId),
      ctx.repository.removePendingDeviceEnrollment("request-1"),
    ]);
    await ctx.repository.removeDeviceSyncCredentialState(vaultId);
    await ctx.repository.removePendingDeviceEnrollment("request-1");

    await expect(
      ctx.repository.getLocalVaultDescriptor(vaultId),
    ).resolves.toBeNull();
    await expect(
      ctx.repository.getDeviceAccessMaterial(vaultId),
    ).resolves.toBeNull();
    await expect(
      ctx.repository.getDeviceAccessRecoveryBackup(vaultId),
    ).resolves.toBeNull();
    await expect(ctx.repository.getVaultSnapshot(vaultId)).resolves.toBeNull();
    await expect(
      ctx.repository.getLocalVaultTrustCheckpoint(vaultId),
    ).resolves.toBeNull();
    await expect(
      ctx.repository.getDeviceSyncCredentialState(vaultId),
    ).resolves.toBeNull();
    await expect(
      ctx.repository.getPendingDeviceEnrollment("request-1"),
    ).resolves.toBeNull();

    await ctx.repository.saveDeviceSyncCredentialState(
      vaultId,
      ctx.artifacts.syncCredentialState,
    );
    await expect(
      ctx.repository.getDeviceSyncCredentialState(vaultId),
    ).resolves.toEqual(ctx.artifacts.syncCredentialState);
    await ctx.repository.removeDeviceSyncCredentialState(vaultId);
  });

  it("round-trips pending enrollment through its exact persisted artifact", async () => {
    const ctx = createContext();
    const pending = ctx.artifacts.pendingDeviceEnrollment;

    await ctx.repository.savePendingDeviceEnrollment(pending);

    await expect(
      ctx.database.pendingDeviceEnrollments.get(pending.requestId),
    ).resolves.toEqual({
      requestId: pending.requestId,
      artifact: {
        requestId: pending.requestId,
        vaultId: pending.vaultId,
        deviceId: pending.deviceId,
        algorithmSuiteId: pending.algorithmSuiteId,
        masterPasswordSalt: encodeBase64Url(
          new Uint8Array(pending.masterPasswordSalt),
        ),
        localKeysProtectionSalt: encodeBase64Url(
          new Uint8Array(pending.localKeysProtectionSalt),
        ),
        protectedPrivateState: pending.protectedPrivateState,
      },
    });
    await expect(
      ctx.repository.getPendingDeviceEnrollment(pending.requestId),
    ).resolves.toEqual(pending);
  });

  it("rejects hostile pending-enrollment artifacts with the exact static error", async () => {
    const ctx = createContext();
    const pending = ctx.artifacts.pendingDeviceEnrollment;
    await ctx.repository.savePendingDeviceEnrollment(pending);
    const persisted = await ctx.database.pendingDeviceEnrollments.get(
      pending.requestId,
    );

    if (
      persisted === undefined ||
      typeof persisted.artifact !== "object" ||
      persisted.artifact === null ||
      Array.isArray(persisted.artifact)
    ) {
      throw new Error("Expected a persisted pending-enrollment artifact.");
    }

    const artifact = persisted.artifact as Record<string, unknown>;
    const protectedPrivateState = artifact.protectedPrivateState;
    if (
      typeof protectedPrivateState !== "object" ||
      protectedPrivateState === null ||
      Array.isArray(protectedPrivateState)
    ) {
      throw new Error("Expected protected pending-enrollment state.");
    }
    const wrapped = protectedPrivateState as Record<string, unknown>;
    const masterPasswordSalt = artifact.masterPasswordSalt;
    const wrappingNonce = wrapped.wrappingNonce;
    if (
      typeof masterPasswordSalt !== "string" ||
      typeof wrappingNonce !== "string"
    ) {
      throw new Error("Expected serialized pending-enrollment bytes.");
    }

    const hostileArtifacts: readonly unknown[] = [
      { ...artifact, unexpected: true },
      { ...artifact, requestId: "" },
      { ...artifact, masterPasswordSalt: `${masterPasswordSalt}=` },
      {
        ...artifact,
        localKeysProtectionSalt: encodeBase64Url(new Uint8Array(31)),
      },
      {
        ...artifact,
        protectedPrivateState: { ...wrapped, unexpected: true },
      },
      {
        ...artifact,
        protectedPrivateState: {
          ...wrapped,
          wrappingNonce: `${wrappingNonce}=`,
        },
      },
    ];

    for (const hostileArtifact of hostileArtifacts) {
      await ctx.database.pendingDeviceEnrollments.put({
        requestId: pending.requestId,
        artifact: hostileArtifact,
      });

      let thrown: unknown;
      try {
        await ctx.repository.getPendingDeviceEnrollment(pending.requestId);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(InvalidDeviceEnrollmentArtifactError);
      expect(thrown).toMatchObject({
        name: "InvalidDeviceEnrollmentArtifactError",
        message: "Device enrollment artifact is malformed.",
      });
      expect(Object.hasOwn(thrown as object, "cause")).toBe(false);
    }
  });

  it("rejects hostile wrapper and artifact records with family-specific errors", async () => {
    const ctx = createContext();
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);
    await ctx.repository.savePendingDeviceEnrollment(
      ctx.artifacts.pendingDeviceEnrollment,
    );
    const vaultId = ctx.artifacts.descriptor.vaultId;
    const descriptor = await ctx.database.localVaultDescriptors.get(vaultId);
    const material = await ctx.database.deviceAccessMaterials.get(vaultId);
    const sync = await ctx.database.deviceSyncCredentialStates.get(vaultId);
    const pending =
      await ctx.database.pendingDeviceEnrollments.get("request-1");

    if (
      descriptor === undefined ||
      material === undefined ||
      sync === undefined ||
      pending === undefined
    ) {
      throw new Error("Expected persisted test records.");
    }

    await ctx.database.localVaultDescriptors.put({
      ...descriptor,
      unexpected: true,
    } as PersistedVaultArtifactRecord);
    await expect(
      ctx.repository.getLocalVaultDescriptor(vaultId),
    ).rejects.toBeInstanceOf(InvalidLocalVaultSecurityRecordError);

    await ctx.database.localVaultDescriptors.put({
      ...descriptor,
      artifact: replaceArtifactField(
        descriptor.artifact,
        "lastUnlockedAt",
        undefined,
      ),
    });
    await expect(
      ctx.repository.getLocalVaultDescriptor(vaultId),
    ).rejects.toBeInstanceOf(InvalidLocalVaultSecurityRecordError);

    await ctx.database.deviceAccessMaterials.put({
      ...material,
      artifact: addUnexpectedField(material.artifact),
    });
    await expect(
      ctx.repository.getDeviceAccessMaterial(vaultId),
    ).rejects.toBeInstanceOf(InvalidLocalVaultSecurityRecordError);

    await ctx.database.deviceSyncCredentialStates.put({
      ...sync,
      artifact: addUnexpectedField(sync.artifact),
    });
    await expect(
      ctx.repository.getDeviceSyncCredentialState(vaultId),
    ).rejects.toBeInstanceOf(InvalidSyncCredentialRecordError);

    await ctx.database.pendingDeviceEnrollments.put({
      ...pending,
      requestId: "different-request",
    } as PersistedPendingDeviceEnrollmentRecord);
    await expect(
      ctx.repository.getPendingDeviceEnrollment("different-request"),
    ).rejects.toBeInstanceOf(InvalidDeviceEnrollmentArtifactError);
  });

  it("rejects structurally valid but inconsistent atomic access records", async () => {
    const ctx = createContext();
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);
    const vaultId = ctx.artifacts.descriptor.vaultId;
    const backup = await ctx.database.deviceAccessRecoveryBackups.get(vaultId);

    if (backup === undefined) {
      throw new Error("Expected a persisted recovery backup.");
    }

    await ctx.database.deviceAccessRecoveryBackups.put({
      ...backup,
      artifact: replaceArtifactField(
        backup.artifact,
        "deviceId",
        "other-device",
      ),
    });

    await expect(
      ctx.repository.getDeviceAccessRecords(vaultId),
    ).rejects.toBeInstanceOf(InvalidLocalVaultSecurityRecordError);
  });

  it("rejects a valid-length but non-importable P-256 key with the default validator", async () => {
    const ctx = createContext();
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);
    const vaultId = ctx.artifacts.descriptor.vaultId;
    const material = await ctx.database.deviceAccessMaterials.get(vaultId);

    if (material === undefined) {
      throw new Error("Expected persisted access material.");
    }

    await ctx.database.deviceAccessMaterials.put({
      ...material,
      artifact: replaceArtifactField(
        material.artifact,
        "devicePublicVaultKey",
        encodeBase64Url(new Uint8Array(65)),
      ),
    });
    const repositoryWithWebCryptoValidation = new IndexedDbVaultLocalRepository(
      ctx.database,
    );

    await expect(
      repositoryWithWebCryptoValidation.getDeviceAccessMaterial(vaultId),
    ).rejects.toBeInstanceOf(InvalidLocalVaultSecurityRecordError);
  });

  it("removes a complete vault record set unconditionally", async () => {
    const ctx = createContext();
    await ctx.repository.saveInitializedLocalVault(ctx.artifacts);

    await ctx.repository.removePersistedLocalVault(
      ctx.artifacts.descriptor.vaultId,
    );
    await ctx.repository.removePersistedLocalVault(
      ctx.artifacts.descriptor.vaultId,
    );

    await expect(ctx.database.localVaultDescriptors.count()).resolves.toBe(0);
    await expect(ctx.database.deviceAccessMaterials.count()).resolves.toBe(0);
    await expect(
      ctx.database.deviceAccessRecoveryBackups.count(),
    ).resolves.toBe(0);
    await expect(ctx.database.vaultSnapshots.count()).resolves.toBe(0);
    await expect(ctx.database.localVaultTrustCheckpoints.count()).resolves.toBe(
      0,
    );
    await expect(ctx.database.deviceSyncCredentialStates.count()).resolves.toBe(
      0,
    );
  });
});

function createArtifacts(): {
  readonly descriptor: LocalVaultDescriptor;
  readonly deviceAccessMaterial: DeviceAccessMaterial;
  readonly deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup;
  readonly snapshot: VaultSnapshot;
  readonly checkpoint: LocalVaultTrustCheckpoint;
  readonly syncCredentialState: EncryptedDeviceSyncCredentialState;
  readonly pendingDeviceEnrollment: PendingDeviceEnrollment;
} {
  const vaultId = "vault-1";
  const deviceId = "device-1";
  const publicSignKey = bytes(32, 1) as DevicePublicSignKey;
  const publicVaultKey = bytes(65, 2) as DeviceVaultPublicKey;
  const descriptor: LocalVaultDescriptor = {
    vaultId,
    displayName: "Test vault",
    createdAt: 1_000,
  };
  const deviceAccessMaterial: DeviceAccessMaterial = {
    revision: 1,
    localAccessGenerationId: "generation-1",
    vaultId,
    deviceId,
    algorithmSuiteId: "spm-v1",
    masterPasswordSalt: bytes(
      32,
      3,
    ) as DeviceAccessMaterial["masterPasswordSalt"],
    localKeysProtectionSalt: bytes(
      32,
      4,
    ) as DeviceAccessMaterial["localKeysProtectionSalt"],
    devicePublicSignKey: publicSignKey,
    devicePublicVaultKey: publicVaultKey,
    protectedLocalKeys: serializedWrapped(5),
  };
  const deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup = {
    revision: 1,
    localAccessGenerationId: "generation-1",
    vaultId,
    deviceId,
    algorithmSuiteId: "spm-v1",
    recoveryLocalKeysProtectionSalt: bytes(
      32,
      6,
    ) as DeviceAccessRecoveryBackup["recoveryLocalKeysProtectionSalt"],
    devicePublicSignKey: publicSignKey,
    devicePublicVaultKey: publicVaultKey,
    protectedLocalKeys: serializedWrapped(7),
  };
  const snapshot: VaultSnapshot = {
    metadata: {
      id: vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: 1_000,
      revisionTimestamp: 1_000,
      snapshotVersionVector: { [deviceId]: 1 },
      algorithmSuiteId: "spm-v1",
      createdByDeviceId: deviceId,
      vaultKeyGeneration: 1,
    },
    trustChain: {
      certificates: [
        {
          payload: {
            version: 1,
            vaultId,
            generation: 0,
            vaultKeyGeneration: 1,
            previousCertificateDigest: null,
            authorizedByDeviceId: deviceId,
            trustedDevices: [
              {
                deviceId,
                publicSignKey,
                publicVaultKey,
              },
            ],
          },
          signature: serializedSignature(8),
        },
      ],
    },
    keySlots: {
      deviceSlots: [
        {
          deviceId,
          vaultKeyGeneration: 1,
          envelope: {
            recipientDeviceId: deviceId,
            vaultKeyGeneration: 1,
            ephemeralPublicKey: bytes(65, 9) as DeviceVaultPublicKey,
            hkdfSalt: bytes(32, 10) as never,
            encryptedVaultMasterKey: serializedEncrypted(11),
          },
        },
      ],
    },
    content: serializedEncrypted(12),
    signature: serializedSignature(13),
  };
  const checkpoint: LocalVaultTrustCheckpoint = {
    payload: {
      version: 1,
      vaultId,
      deviceId,
      trustGeneration: 0,
      trustCertificateDigest: certificateDigest(0),
      vaultKeyGeneration: 1,
      snapshotVersionVector: { [deviceId]: 1 },
      snapshotDigest: snapshotDigest(1),
    },
    signature: serializedSignature(14),
  };
  const syncCredentialState: EncryptedDeviceSyncCredentialState =
    serializedEncrypted(15);
  const pendingDeviceEnrollment: PendingDeviceEnrollment = {
    requestId: "request-1",
    vaultId,
    deviceId,
    algorithmSuiteId: "spm-v1",
    masterPasswordSalt: bytes(
      32,
      16,
    ) as PendingDeviceEnrollment["masterPasswordSalt"],
    localKeysProtectionSalt: bytes(
      32,
      17,
    ) as PendingDeviceEnrollment["localKeysProtectionSalt"],
    protectedPrivateState: serializedWrapped(18),
  };

  return {
    descriptor,
    deviceAccessMaterial,
    deviceAccessRecoveryBackup,
    snapshot,
    checkpoint,
    syncCredentialState,
    pendingDeviceEnrollment,
  };
}

function createReplacementAccessRecords(
  artifacts: ReturnType<typeof createArtifacts>,
  generation: number,
): {
  readonly deviceAccessMaterial: DeviceAccessMaterial;
  readonly deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup;
} {
  return {
    deviceAccessMaterial: {
      ...artifacts.deviceAccessMaterial,
      revision: 2,
      localAccessGenerationId: `generation-${generation}`,
      masterPasswordSalt: bytes(
        32,
        30 + generation,
      ) as DeviceAccessMaterial["masterPasswordSalt"],
    },
    deviceAccessRecoveryBackup: {
      ...artifacts.deviceAccessRecoveryBackup,
      revision: 2,
      localAccessGenerationId: `generation-${generation}`,
    },
  };
}

function createNextSnapshot(
  snapshot: VaultSnapshot,
  revision: number,
): VaultSnapshot {
  return {
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      revisionTimestamp: 1_000 + revision,
      snapshotVersionVector: { "device-1": revision },
    },
    signature: serializedSignature(40 + revision),
  };
}

function createNextCheckpoint(
  checkpoint: LocalVaultTrustCheckpoint,
  revision: number,
): LocalVaultTrustCheckpoint {
  return {
    payload: {
      ...checkpoint.payload,
      snapshotVersionVector: { "device-1": revision },
      snapshotDigest: snapshotDigest(revision),
    },
    signature: serializedSignature(50 + revision),
  };
}

function serializedWrapped(seed: number) {
  return {
    wrappedKey: encodeBase64Url(new Uint8Array(bytes(48, seed))),
    wrappingNonce: encodeBase64Url(new Uint8Array(bytes(12, seed + 1))),
  };
}

function serializedEncrypted(seed: number) {
  return {
    ciphertext: encodeBase64Url(new Uint8Array(bytes(48, seed))),
    encryptionNonce: encodeBase64Url(new Uint8Array(bytes(12, seed + 1))),
  };
}

function serializedSignature(seed: number) {
  return {
    signature: encodeBase64Url(new Uint8Array(bytes(64, seed))),
  };
}

function certificateDigest(generation: number): string {
  return encodeBase64Url(new Uint8Array(bytes(32, 150 + generation)));
}

function snapshotDigest(revision: number): string {
  return encodeBase64Url(new Uint8Array(bytes(32, 100 + revision)));
}

function bytes(length: number, seed: number): ArrayBuffer {
  return Uint8Array.from({ length }, (_, index) => (seed + index) % 256).buffer;
}

function addUnexpectedField(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object artifact.");
  }

  return { ...value, unexpected: true };
}

function replaceArtifactField(
  value: unknown,
  fieldName: string,
  fieldValue: unknown,
): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object artifact.");
  }

  return { ...value, [fieldName]: fieldValue };
}

function createNoOpAsymmetricKeyValidator(): AsymmetricKeyValidator {
  const importedKey = {} as CryptoKey;

  return {
    importDeviceSignPublicKey: async () => importedKey,
    importDeviceSignPrivateKey: async () => importedKey,
    importDeviceVaultPublicKey: async () => importedKey,
    importDeviceVaultPrivateKey: async () => importedKey,
  };
}
