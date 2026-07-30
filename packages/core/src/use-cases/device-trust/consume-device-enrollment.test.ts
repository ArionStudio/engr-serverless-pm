import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import type {
  DevicePublicSignKey,
  DeviceVaultPublicKey,
  VaultTrustChain,
  VerifiedVaultTrustState,
} from "../../domain/device-trust";
import type { UnlockedVault } from "../../domain/session";
import type { VaultSnapshot } from "../../domain/snapshot";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import { InvalidDeviceEnrollmentTransitionError } from "../../errors/device-enrollment.errors";
import {
  RemoteVaultSnapshotChangedError,
  SyncConflictDetectedError,
  SyncResolutionIncompleteError,
} from "../../errors/sync.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync";
import { ConsumeDeviceEnrollmentUseCase } from "./consume-device-enrollment";
import { PrepareDeviceEnrollmentConsumptionUseCase } from "./prepare-device-enrollment-consumption";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const authorizerPublicSignKey = new Uint8Array([3])
    .buffer as DevicePublicSignKey;
  const authorizerPublicVaultKey = new Uint8Array([4])
    .buffer as DeviceVaultPublicKey;
  const enrolledPublicSignKey = new Uint8Array([5])
    .buffer as DevicePublicSignKey;
  const enrolledPublicVaultKey = new Uint8Array([6])
    .buffer as DeviceVaultPublicKey;
  const authorizer = {
    deviceId: "authorizer-device",
    publicSignKey: authorizerPublicSignKey,
    publicVaultKey: authorizerPublicVaultKey,
  };
  const enrolledDevice = {
    deviceId: "enrolled-device",
    publicSignKey: enrolledPublicSignKey,
    publicVaultKey: enrolledPublicVaultKey,
  };
  vi.mocked(ports.crypto.digestDevicePublicSignKey).mockImplementation(
    async (key) => {
      if (key === authorizerPublicSignKey) {
        return "authorizer-sign-key";
      }

      if (key === enrolledPublicSignKey) {
        return "enrolled-sign-key";
      }

      return "local-sign-key";
    },
  );
  vi.mocked(ports.crypto.digestDevicePublicVaultKey).mockImplementation(
    async (key) => {
      if (key === authorizerPublicVaultKey) {
        return "authorizer-vault-key";
      }

      if (key === enrolledPublicVaultKey) {
        return "enrolled-vault-key";
      }

      return "local-vault-key";
    },
  );
  const localTrust: VerifiedVaultTrustState = {
    generation: 1,
    vaultKeyGeneration: 1,
    certificateDigest: values.vaultTrustCertificateDigest,
    trustedDevices: [
      ...values.verifiedVaultTrustState.trustedDevices,
      authorizer,
    ],
  };
  const localTrustCertificate = {
    payload: {
      version: 1 as const,
      vaultId: values.vaultId,
      generation: 1,
      vaultKeyGeneration: 1,
      previousCertificateDigest: values.vaultTrustCertificateDigest,
      authorizedByDeviceId: values.deviceId,
      trustedDevices: localTrust.trustedDevices,
    },
    signature: values.vaultTrustCertificateSignature,
  };
  const localChain: VaultTrustChain = {
    certificates: [
      ...values.vaultTrustChain.certificates,
      localTrustCertificate,
    ],
  };
  const localVault = {
    ...values.decryptedVault,
    versionVector: { [values.deviceId]: 2 },
    syncTarget: values.syncTarget,
    deviceProfiles: [
      {
        id: values.deviceId,
        name: "Local survivor",
        createdAt: values.timestamp,
        versionVector: { [values.deviceId]: 1 },
      },
      {
        id: authorizer.deviceId,
        name: "Authorizer",
        createdAt: values.timestamp,
        versionVector: { [values.deviceId]: 1 },
      },
    ],
  };
  const localSnapshot: VaultSnapshot = {
    metadata: {
      id: values.vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: values.timestamp,
      revisionTimestamp: values.timestamp,
      snapshotVersionVector: { [values.deviceId]: 2 },
      algorithmSuiteId: ports.crypto.algorithmSuite.id,
      createdByDeviceId: values.deviceId,
      vaultKeyGeneration: 1,
    },
    trustChain: localChain,
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          vaultKeyGeneration: 1,
          envelope: values.vaultKeyEnvelope,
        },
        {
          deviceId: authorizer.deviceId,
          vaultKeyGeneration: 1,
          envelope: {
            ...values.pendingDeviceVaultKeyEnvelope,
            recipientDeviceId: authorizer.deviceId,
          },
        },
      ],
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };
  const remoteTrustCertificate = {
    payload: {
      version: 1 as const,
      vaultId: values.vaultId,
      generation: 2,
      vaultKeyGeneration: 1,
      previousCertificateDigest: values.vaultTrustCertificateDigest,
      authorizedByDeviceId: authorizer.deviceId,
      trustedDevices: [...localTrust.trustedDevices, enrolledDevice],
    },
    signature: values.vaultTrustCertificateSignature,
  };
  const remoteSnapshot: VaultSnapshot = {
    ...localSnapshot,
    metadata: {
      ...localSnapshot.metadata,
      revisionTimestamp: values.timestamp + 1,
      snapshotVersionVector: { [values.deviceId]: 3 },
      createdByDeviceId: authorizer.deviceId,
    },
    trustChain: {
      certificates: [...localChain.certificates, remoteTrustCertificate],
    },
    keySlots: {
      deviceSlots: [
        ...localSnapshot.keySlots.deviceSlots,
        {
          deviceId: enrolledDevice.deviceId,
          vaultKeyGeneration: 1,
          envelope: {
            ...values.pendingDeviceVaultKeyEnvelope,
            recipientDeviceId: enrolledDevice.deviceId,
          },
        },
      ],
    },
  };
  const unlockedVault: UnlockedVault = {
    vaultId: values.vaultId,
    deviceId: values.deviceId,
    vault: localVault,
    vaultMasterKey: values.vaultMasterKey,
    devicePrivateSignKey: values.devicePrivateSignKey,
    devicePrivateVaultKey: values.devicePrivateVaultKey,
    deviceLocalProtectionKey: values.deviceLocalProtectionKey,
    trustedSnapshotContext: {
      snapshotDigest: values.vaultSnapshotDigest,
      trust: localTrust,
    },
    vaultTrustAnchor: values.vaultTrustAnchor,
  };
  ports.saved.vaultSnapshot = localSnapshot;
  ports.saved.vaultSnapshotDigest = values.vaultSnapshotDigest;
  ports.saved.deviceSyncCredentialState =
    values.encryptedDeviceSyncCredentialState;
  ports.saved.unlockedVaultSession = {
    sessionId: values.sessionId,
    unlockedVault,
    sourceSnapshotVersionVector: localSnapshot.metadata.snapshotVersionVector,
  };
  vi.mocked(
    ports.syncProvider.getLatestVaultSnapshotDescriptor,
  ).mockResolvedValue(
    toVaultSnapshotDescriptor(values.vaultId, remoteSnapshot),
  );
  vi.mocked(ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
    remoteSnapshot,
  );
  vi.mocked(ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
    localVault,
  );
  const vaultSnapshot = new VaultSnapshotService(
    ports.crypto,
    ports.clock,
    ports.vaultLocalRepository,
  );
  const vaultSyncGuard = new VaultSyncGuardService(
    ports.syncProvider,
    vaultSnapshot,
    ports.sessionServices.unlockedVaultSession,
    ports.crypto,
    ports.vaultLocalRepository,
  );
  const prepareUseCase = new PrepareDeviceEnrollmentConsumptionUseCase(
    ports.crypto,
    ports.syncProvider,
    ports.sessionServices.unlockedVaultSession,
    vaultSnapshot,
    vaultSyncGuard,
  );
  const consumeUseCase = new ConsumeDeviceEnrollmentUseCase(
    ports.crypto,
    ports.syncProvider,
    ports.sessionServices.unlockedVaultSession,
    vaultSnapshot,
    ports.vaultLocalRepository,
    vaultSyncGuard,
  );

  return {
    values,
    ports,
    authorizer,
    enrolledDevice,
    localVault,
    localSnapshot,
    remoteSnapshot,
    prepareUseCase,
    consumeUseCase,
  };
}

function createCommand(ctx: ReturnType<typeof createContext>) {
  return {
    vaultId: ctx.values.vaultId,
    remoteSnapshotDescriptor: toVaultSnapshotDescriptor(
      ctx.values.vaultId,
      ctx.remoteSnapshot,
    ),
    resolution: {
      entryResolutions: [],
      tagResolutions: [],
      deviceProfileResolutions: [],
    },
  };
}

describe("device enrollment consumption", () => {
  it("treats the enrolled profile as mandatory state without changing local state", async () => {
    const ctx = createContext();
    const remoteVault = {
      ...ctx.localVault,
      versionVector: {
        ...ctx.localVault.versionVector,
        [ctx.enrolledDevice.deviceId]: 1,
      },
      deviceProfiles: [
        ...ctx.localVault.deviceProfiles,
        {
          id: ctx.enrolledDevice.deviceId,
          name: "New device",
          createdAt: ctx.values.timestamp + 1,
          versionVector: { [ctx.enrolledDevice.deviceId]: 1 },
        },
      ],
    };
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
      remoteVault,
    );

    const result = await ctx.prepareUseCase.execute({
      vaultId: ctx.values.vaultId,
    });

    expect(result.enrolledDeviceIds).toEqual([ctx.enrolledDevice.deviceId]);
    expect(result.vaultKeyGeneration).toBe(1);
    expect(result.review.deviceProfileReviews).toEqual([]);
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("does not allow resolution to remove the enrolled profile", async () => {
    const ctx = createContext();
    const remoteVault = {
      ...ctx.localVault,
      versionVector: {
        ...ctx.localVault.versionVector,
        [ctx.enrolledDevice.deviceId]: 1,
      },
      deviceProfiles: [
        ...ctx.localVault.deviceProfiles,
        {
          id: ctx.enrolledDevice.deviceId,
          name: "New device",
          createdAt: ctx.values.timestamp + 1,
          versionVector: { [ctx.enrolledDevice.deviceId]: 1 },
        },
      ],
    };
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
      remoteVault,
    );

    await expect(
      ctx.consumeUseCase.execute({
        ...createCommand(ctx),
        resolution: {
          entryResolutions: [],
          tagResolutions: [],
          deviceProfileResolutions: [
            {
              deviceId: ctx.enrolledDevice.deviceId,
              action: "use_local",
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(SyncResolutionIncompleteError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects a tombstone for a newly trusted identity", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.localVault,
      deletedDeviceProfiles: [
        {
          id: ctx.enrolledDevice.deviceId,
          deletedAt: ctx.values.timestamp + 1,
          versionVector: { [ctx.values.deviceId]: 3 },
        },
      ],
    });

    await expect(
      ctx.prepareUseCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(InvalidDeviceEnrollmentTransitionError);
  });

  it("rejects a tombstone for an existing trusted survivor", async () => {
    const ctx = createContext();
    const survivorProfile = ctx.localVault.deviceProfiles.find(
      (profile) => profile.id === ctx.authorizer.deviceId,
    );

    if (survivorProfile === undefined) {
      throw new Error("Expected an existing survivor profile.");
    }

    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.localVault,
      deviceProfiles: ctx.localVault.deviceProfiles.filter(
        (profile) => profile.id !== ctx.authorizer.deviceId,
      ),
      deletedDeviceProfiles: [
        {
          id: ctx.authorizer.deviceId,
          deletedAt: ctx.values.timestamp + 1,
          versionVector: {
            ...survivorProfile.versionVector,
            [ctx.values.deviceId]: 3,
          },
        },
      ],
    });

    await expect(
      ctx.prepareUseCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(InvalidDeviceEnrollmentTransitionError);
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects a tombstone for a device absent from trust history", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.localVault,
      deletedDeviceProfiles: [
        {
          id: "never-trusted-device",
          deletedAt: ctx.values.timestamp + 1,
          versionVector: { [ctx.values.deviceId]: 3 },
        },
      ],
    });

    await expect(
      ctx.prepareUseCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(InvalidDeviceEnrollmentTransitionError);
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects an enrollment snapshot that changes the sync target", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.localVault,
      syncTarget: {
        ...ctx.values.syncTarget,
        targetConfig: { bucket: "another-bucket" },
      },
    });

    await expect(
      ctx.prepareUseCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toMatchObject({
      name: "InvalidDeviceEnrollmentTransitionError",
      message: expect.stringContaining(
        "the enrollment snapshot changed protected sync state",
      ),
    });
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("advances an existing survivor to the authorized trust state", async () => {
    const ctx = createContext();

    const result = await ctx.consumeUseCase.execute(createCommand(ctx));

    expect(result).toEqual({
      enrolledDeviceIds: [ctx.enrolledDevice.deviceId],
      vaultKeyGeneration: 1,
    });
    expect(ctx.ports.saved.vaultSnapshot).toBe(ctx.remoteSnapshot);
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.trustedSnapshotContext
        .trust.generation,
    ).toBe(2);
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("imports signed provider credential revocation completion with enrollment", async () => {
    const ctx = createContext();
    const session = ctx.ports.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          providerCredentialRevocationPending: {
            revokedDeviceIds: [ctx.values.pendingDeviceId],
            vaultKeyGeneration: 1,
          },
        },
      },
    };

    await ctx.consumeUseCase.execute(createCommand(ctx));

    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault
        .providerCredentialRevocationPending,
    ).toBeUndefined();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("reviews, resolves, and uploads later ordinary content changes", async () => {
    const ctx = createContext();
    const remoteVault = {
      ...ctx.localVault,
      versionVector: { [ctx.values.deviceId]: 3 },
      tags: [
        {
          id: 1,
          name: "Remote tag",
          versionVector: { [ctx.values.deviceId]: 3 },
        },
      ],
    };
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
      remoteVault,
    );

    await ctx.consumeUseCase.execute({
      ...createCommand(ctx),
      resolution: {
        entryResolutions: [],
        tagResolutions: [{ tagId: 1, action: "use_remote" }],
        deviceProfileResolutions: [],
      },
    });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      expect.objectContaining({
        trustChain: ctx.remoteSnapshot.trustChain,
        keySlots: ctx.remoteSnapshot.keySlots,
      }),
      toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.remoteSnapshot),
    );
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.tags,
    ).toEqual([expect.objectContaining({ id: 1, name: "Remote tag" })]);
  });

  it("does not re-upload a stale provider marker with resolved enrollment content", async () => {
    const ctx = createContext();
    const session = ctx.ports.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          providerCredentialRevocationPending: {
            revokedDeviceIds: [ctx.values.pendingDeviceId],
            vaultKeyGeneration: 1,
          },
        },
      },
    };
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.localVault,
      versionVector: { [ctx.values.deviceId]: 3 },
      tags: [
        {
          id: 1,
          name: "Remote tag",
          versionVector: { [ctx.values.deviceId]: 3 },
        },
      ],
    });

    await ctx.consumeUseCase.execute({
      ...createCommand(ctx),
      resolution: {
        entryResolutions: [],
        tagResolutions: [{ tagId: 1, action: "use_remote" }],
        deviceProfileResolutions: [],
      },
    });

    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault
        .providerCredentialRevocationPending,
    ).toBeUndefined();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalled();
  });

  it("rejects a provider marker added through enrollment consumption", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.localVault,
      providerCredentialRevocationPending: {
        revokedDeviceIds: [ctx.values.pendingDeviceId],
        vaultKeyGeneration: 1,
      },
    });

    await expect(
      ctx.prepareUseCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toMatchObject({
      name: "InvalidDeviceEnrollmentTransitionError",
      message: expect.stringContaining("changed protected sync state"),
    });
  });

  it("rejects a change to an existing survivor envelope", async () => {
    const ctx = createContext();
    const changedSnapshot = {
      ...ctx.remoteSnapshot,
      keySlots: {
        deviceSlots: ctx.remoteSnapshot.keySlots.deviceSlots.map((slot) =>
          slot.deviceId === ctx.values.deviceId
            ? {
                ...slot,
                envelope: {
                  ...slot.envelope,
                  encryptedVaultMasterKey: {
                    ...slot.envelope.encryptedVaultMasterKey,
                    ciphertext:
                      ctx.values.replacementEncryptedDeviceSyncCredentialState
                        .ciphertext,
                  },
                },
              }
            : slot,
        ),
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(
      toVaultSnapshotDescriptor(ctx.values.vaultId, changedSnapshot),
    );
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      changedSnapshot,
    );

    await expect(
      ctx.prepareUseCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(InvalidDeviceEnrollmentTransitionError);
  });

  it("rejects a changed survivor envelope public key", async () => {
    const ctx = createContext();
    const changedSnapshot = {
      ...ctx.remoteSnapshot,
      keySlots: {
        deviceSlots: ctx.remoteSnapshot.keySlots.deviceSlots.map((slot) =>
          slot.deviceId === ctx.values.deviceId
            ? {
                ...slot,
                envelope: {
                  ...slot.envelope,
                  ephemeralPublicKey: new Uint8Array([9])
                    .buffer as DeviceVaultPublicKey,
                },
              }
            : slot,
        ),
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(
      toVaultSnapshotDescriptor(ctx.values.vaultId, changedSnapshot),
    );
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      changedSnapshot,
    );

    await expect(
      ctx.prepareUseCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(InvalidDeviceEnrollmentTransitionError);
  });

  it("rejects when the reviewed remote snapshot changes before apply", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce({
      ...toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.remoteSnapshot),
      revisionTimestamp: ctx.values.timestamp + 2,
    });

    await expect(
      ctx.consumeUseCase.execute(createCommand(ctx)),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("restores local state when resolved content upload fails", async () => {
    const ctx = createContext();
    const remoteVault = {
      ...ctx.localVault,
      versionVector: { [ctx.values.deviceId]: 3 },
      tags: [
        {
          id: 1,
          name: "Remote tag",
          versionVector: { [ctx.values.deviceId]: 3 },
        },
      ],
    };
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
      remoteVault,
    );
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValueOnce(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
    );

    await expect(
      ctx.consumeUseCase.execute({
        ...createCommand(ctx),
        resolution: {
          entryResolutions: [],
          tagResolutions: [{ tagId: 1, action: "use_remote" }],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(SyncConflictDetectedError);

    expect(ctx.ports.saved.vaultSnapshot).toBe(ctx.localSnapshot);
    expect(ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault).toBe(
      ctx.localVault,
    );
  });
});
