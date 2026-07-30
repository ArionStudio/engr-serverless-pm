import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import {
  createCoreTestValues,
  type CoreTestValues,
} from "../../__tests__/fixtures/values";
import type {
  DevicePublicSignKey,
  DeviceVaultPublicKey,
  VaultTrustChain,
  VerifiedVaultTrustState,
} from "../../domain/device-trust";
import type { UnlockedVault } from "../../domain/session";
import type { VaultSnapshot } from "../../domain/snapshot";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import { revokeDeviceProfileFromVault } from "../../domain/vault/vault-device.mutations";
import { InvalidDeviceRevocationTransitionError } from "../../errors/device-revocation.errors";
import {
  RemoteVaultSnapshotChangedError,
  SyncConflictDetectedError,
  SyncResolutionIncompleteError,
} from "../../errors/sync.errors";
import { DeviceKeySlotNotFoundError } from "../../errors/unlock-vault.errors";
import { LocalVaultSnapshotChangedError } from "../../errors/vault-snapshot.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { ConsumeDeviceRevocationUseCase } from "./consume-device-revocation";
import { PrepareDeviceRevocationConsumptionUseCase } from "./prepare-device-revocation-consumption";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const targetIdentity = {
    deviceId: values.pendingDeviceId,
    publicSignKey: values.pendingDevicePublicSignKey,
    publicVaultKey: values.pendingDevicePublicVaultKey,
  };
  const localTrust: VerifiedVaultTrustState = {
    generation: 1,
    vaultKeyGeneration: 1,
    certificateDigest: values.vaultTrustCertificateDigest,
    trustedDevices: [
      ...values.verifiedVaultTrustState.trustedDevices,
      targetIdentity,
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
        name: "Current",
        createdAt: values.timestamp,
        versionVector: { [values.deviceId]: 1 },
      },
      {
        id: values.pendingDeviceId,
        name: "Revoked",
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
          deviceId: values.pendingDeviceId,
          vaultKeyGeneration: 1,
          envelope: values.pendingDeviceVaultKeyEnvelope,
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
      vaultKeyGeneration: 2,
      previousCertificateDigest: values.vaultTrustCertificateDigest,
      authorizedByDeviceId: values.deviceId,
      trustedDevices: values.verifiedVaultTrustState.trustedDevices,
    },
    signature: values.vaultTrustCertificateSignature,
  };
  const remoteSnapshot: VaultSnapshot = {
    ...localSnapshot,
    metadata: {
      ...localSnapshot.metadata,
      revisionTimestamp: values.timestamp + 1,
      snapshotVersionVector: { [values.deviceId]: 3 },
      vaultKeyGeneration: 2,
    },
    trustChain: {
      certificates: [...localChain.certificates, remoteTrustCertificate],
    },
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          vaultKeyGeneration: 2,
          envelope: {
            ...values.vaultKeyEnvelope,
            vaultKeyGeneration: 2,
            encryptedVaultMasterKey: {
              ...values.vaultKeyEnvelope.encryptedVaultMasterKey,
              ciphertext:
                values.replacementEncryptedDeviceSyncCredentialState.ciphertext,
            },
          },
        },
      ],
    },
  };
  const remoteVault = revokeDeviceProfileFromVault(
    localVault,
    values.deviceId,
    values.pendingDeviceId,
    values.timestamp + 1,
  );
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
  vi.mocked(ports.crypto.openDeviceVaultKeyEnvelope).mockResolvedValue(
    values.rotatedVaultMasterKey,
  );
  vi.mocked(ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
    remoteVault,
  );
  const snapshotService = new VaultSnapshotService(
    ports.crypto,
    ports.clock,
    ports.vaultLocalRepository,
  );
  const useCase = new ConsumeDeviceRevocationUseCase(
    ports.crypto,
    ports.syncProvider,
    ports.sessionServices.unlockedVaultSession,
    snapshotService,
    ports.vaultLocalRepository,
  );

  return {
    values,
    ports,
    localSnapshot,
    remoteSnapshot,
    remoteVault,
    snapshotService,
    useCase,
  };
}

function createCommand(ctx: {
  readonly values: CoreTestValues;
  readonly remoteSnapshot: VaultSnapshot;
}) {
  return {
    vaultId: ctx.values.vaultId,
    replacementSyncConfig: ctx.values.replacementSyncConfigInput,
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

describe("PrepareDeviceRevocationConsumptionUseCase", () => {
  it("returns only later content changes without mutating local state", async () => {
    const ctx = createContext();
    const remoteVault = {
      ...ctx.remoteVault,
      tags: [
        {
          id: 1,
          name: "Later change",
          versionVector: { [ctx.values.deviceId]: 3 },
        },
      ],
    };
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
      remoteVault,
    );
    const useCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
    );

    const result = await useCase.execute({
      vaultId: ctx.values.vaultId,
      replacementSyncConfig: ctx.values.replacementSyncConfigInput,
    });

    expect(result).toMatchObject({
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      vaultKeyGeneration: 2,
      review: {
        entryReviews: [],
        tagReviews: [
          {
            tagId: 1,
            preselectedAction: "use_remote",
          },
        ],
        deviceProfileReviews: [],
      },
    });
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });
});

describe("ConsumeDeviceRevocationUseCase", () => {
  it("opens the survivor envelope and commits the rotated snapshot", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute(createCommand(ctx));

    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).toHaveBeenCalledWith(
      ctx.remoteSnapshot.keySlots.deviceSlots[0]?.envelope,
      ctx.values.devicePrivateVaultKey,
      {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vaultKeyGeneration: 2,
        algorithmSuiteId: "spm-v1",
      },
    );
    expect(ctx.ports.saved.vaultSnapshot).toEqual(ctx.remoteSnapshot);
    expect(ctx.ports.saved.unlockedVaultSession?.unlockedVault).toMatchObject({
      vaultMasterKey: ctx.values.rotatedVaultMasterKey,
      vault: ctx.remoteVault,
    });
    expect(
      ctx.remoteSnapshot.keySlots.deviceSlots.some(
        (slot) => slot.deviceId === ctx.values.pendingDeviceId,
      ),
    ).toBe(false);
    expect(result.providerCredentialRevocation).toBe(
      "pending_external_disable",
    );
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("consumes multiple skipped revocations and records every removed device", async () => {
    const ctx = createContext();
    const session = ctx.ports.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    const thirdPublicSignKey = new Uint8Array([3])
      .buffer as DevicePublicSignKey;
    const thirdPublicVaultKey = new Uint8Array([4])
      .buffer as DeviceVaultPublicKey;
    const thirdDeviceId = "third-device";
    const thirdIdentity = {
      deviceId: thirdDeviceId,
      publicSignKey: thirdPublicSignKey,
      publicVaultKey: thirdPublicVaultKey,
    };
    const localTrustCertificate = {
      payload: {
        version: 1 as const,
        vaultId: ctx.values.vaultId,
        generation: 2,
        vaultKeyGeneration: 1,
        previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
        authorizedByDeviceId: ctx.values.deviceId,
        trustedDevices: [
          ...session.unlockedVault.trustedSnapshotContext.trust.trustedDevices,
          thirdIdentity,
        ],
      },
      signature: ctx.values.vaultTrustCertificateSignature,
    };
    const localTrust: VerifiedVaultTrustState = {
      generation: 2,
      vaultKeyGeneration: 1,
      certificateDigest: ctx.values.vaultTrustCertificateDigest,
      trustedDevices: localTrustCertificate.payload.trustedDevices,
    };
    const localVault = {
      ...session.unlockedVault.vault,
      deviceProfiles: [
        ...session.unlockedVault.vault.deviceProfiles,
        {
          id: thirdDeviceId,
          name: "Third device",
          createdAt: ctx.values.timestamp,
          versionVector: { [ctx.values.deviceId]: 1 },
        },
      ],
    };
    const localSnapshot: VaultSnapshot = {
      ...ctx.localSnapshot,
      metadata: {
        ...ctx.localSnapshot.metadata,
        snapshotVersionVector: { [ctx.values.deviceId]: 3 },
      },
      trustChain: {
        certificates: [
          ...ctx.localSnapshot.trustChain.certificates,
          localTrustCertificate,
        ],
      },
      keySlots: {
        deviceSlots: [
          ...ctx.localSnapshot.keySlots.deviceSlots,
          {
            deviceId: thirdDeviceId,
            vaultKeyGeneration: 1,
            envelope: {
              ...ctx.values.pendingDeviceVaultKeyEnvelope,
              recipientDeviceId: thirdDeviceId,
            },
          },
        ],
      },
    };
    const firstRevocationCertificate = {
      payload: {
        version: 1 as const,
        vaultId: ctx.values.vaultId,
        generation: 3,
        vaultKeyGeneration: 2,
        previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
        authorizedByDeviceId: ctx.values.deviceId,
        trustedDevices: localTrust.trustedDevices.filter(
          (device) => device.deviceId !== ctx.values.pendingDeviceId,
        ),
      },
      signature: ctx.values.vaultTrustCertificateSignature,
    };
    const secondRevocationCertificate = {
      payload: {
        version: 1 as const,
        vaultId: ctx.values.vaultId,
        generation: 4,
        vaultKeyGeneration: 3,
        previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
        authorizedByDeviceId: ctx.values.deviceId,
        trustedDevices: ctx.values.verifiedVaultTrustState.trustedDevices,
      },
      signature: ctx.values.vaultTrustCertificateSignature,
    };
    const remoteSnapshot: VaultSnapshot = {
      ...localSnapshot,
      metadata: {
        ...localSnapshot.metadata,
        revisionTimestamp: ctx.values.timestamp + 2,
        snapshotVersionVector: { [ctx.values.deviceId]: 5 },
        vaultKeyGeneration: 3,
      },
      trustChain: {
        certificates: [
          ...localSnapshot.trustChain.certificates,
          firstRevocationCertificate,
          secondRevocationCertificate,
        ],
      },
      keySlots: {
        deviceSlots: [
          {
            ...localSnapshot.keySlots.deviceSlots[0],
            vaultKeyGeneration: 3,
            envelope: {
              ...ctx.values.vaultKeyEnvelope,
              vaultKeyGeneration: 3,
            },
          },
        ],
      },
    };
    const remoteVault = revokeDeviceProfileFromVault(
      revokeDeviceProfileFromVault(
        localVault,
        ctx.values.deviceId,
        ctx.values.pendingDeviceId,
        ctx.values.timestamp + 1,
      ),
      ctx.values.deviceId,
      thirdDeviceId,
      ctx.values.timestamp + 2,
    );
    vi.mocked(ctx.ports.crypto.digestDevicePublicSignKey).mockImplementation(
      async (key) => {
        if (key === ctx.values.pendingDevicePublicSignKey) {
          return "pending-sign";
        }

        return key === thirdPublicSignKey ? "third-sign" : "initial-sign";
      },
    );
    vi.mocked(ctx.ports.crypto.digestDevicePublicVaultKey).mockImplementation(
      async (key) => {
        if (key === ctx.values.pendingDevicePublicVaultKey) {
          return "pending-vault";
        }

        return key === thirdPublicVaultKey ? "third-vault" : "initial-vault";
      },
    );
    ctx.ports.saved.vaultSnapshot = localSnapshot;
    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      sourceSnapshotVersionVector: localSnapshot.metadata.snapshotVersionVector,
      unlockedVault: {
        ...session.unlockedVault,
        vault: localVault,
        trustedSnapshotContext: {
          ...session.unlockedVault.trustedSnapshotContext,
          trust: localTrust,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(
      toVaultSnapshotDescriptor(ctx.values.vaultId, remoteSnapshot),
    );
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      remoteSnapshot,
    );
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
      remoteVault,
    );

    await expect(
      ctx.useCase.execute({
        ...createCommand(ctx),
        remoteSnapshotDescriptor: toVaultSnapshotDescriptor(
          ctx.values.vaultId,
          remoteSnapshot,
        ),
      }),
    ).resolves.toMatchObject({
      revokedDeviceIds: [ctx.values.pendingDeviceId, thirdDeviceId],
      vaultKeyGeneration: 3,
    });

    expect(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).toHaveBeenCalledWith(
      {
        currentCredentials: ctx.values.replacementSyncCredentials,
        previousCredentials: {
          credentials: ctx.values.syncCredentials,
          revokedDeviceIds: [ctx.values.pendingDeviceId, thirdDeviceId],
          vaultKeyGeneration: 3,
        },
      },
      ctx.values.deviceLocalProtectionKey,
      expect.anything(),
    );
  });

  it("applies normal sync resolution to changes after revocation", async () => {
    const ctx = createContext();
    const remoteVault = {
      ...ctx.remoteVault,
      tags: [
        {
          id: 1,
          name: "Later change",
          versionVector: { [ctx.values.deviceId]: 3 },
        },
      ],
    };
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...remoteVault,
    });

    await expect(
      ctx.useCase.execute({
        ...createCommand(ctx),
        resolution: {
          entryResolutions: [],
          tagResolutions: [{ tagId: 1, action: "use_remote" }],
          deviceProfileResolutions: [],
        },
      }),
    ).resolves.toMatchObject({
      revokedDeviceIds: [ctx.values.pendingDeviceId],
    });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.replacementSyncAccess,
      expect.anything(),
      toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.remoteSnapshot),
    );
  });

  it("rejects an incomplete later-content resolution without mutation", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.remoteVault,
      tags: [
        {
          id: 1,
          name: "Later change",
          versionVector: { [ctx.values.deviceId]: 3 },
        },
      ],
    });

    await expect(
      ctx.useCase.execute(createCommand(ctx)),
    ).rejects.toBeInstanceOf(SyncResolutionIncompleteError);

    expect(ctx.ports.saved.vaultSnapshot).toEqual(ctx.localSnapshot);
    expect(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).not.toHaveBeenCalled();
  });

  it("rejects when the remote descriptor changed after review", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue({
      ...toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.remoteSnapshot),
      revisionTimestamp: ctx.remoteSnapshot.metadata.revisionTimestamp + 1,
    });

    await expect(
      ctx.useCase.execute(createCommand(ctx)),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("restores local state when resolved-snapshot remote compare-and-set fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.remoteVault,
      tags: [
        {
          id: 1,
          name: "Later change",
          versionVector: { [ctx.values.deviceId]: 3 },
        },
      ],
    });
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValue(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
    );

    await expect(
      ctx.useCase.execute({
        ...createCommand(ctx),
        resolution: {
          entryResolutions: [],
          tagResolutions: [{ tagId: 1, action: "use_remote" }],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(SyncConflictDetectedError);

    expect(ctx.ports.saved.vaultSnapshot).toEqual(ctx.localSnapshot);
    expect(ctx.ports.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
  });

  it("rejects a changed vault creation timestamp before staging credentials", async () => {
    const ctx = createContext();
    const remoteSnapshot: VaultSnapshot = {
      ...ctx.remoteSnapshot,
      metadata: {
        ...ctx.remoteSnapshot.metadata,
        vaultCreationTimestamp:
          ctx.localSnapshot.metadata.vaultCreationTimestamp + 1,
      },
    };
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      remoteSnapshot,
    );

    await expect(
      ctx.useCase.execute(createCommand(ctx)),
    ).rejects.toBeInstanceOf(InvalidDeviceRevocationTransitionError);

    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects a remote sync-target change before staging credentials", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.remoteVault,
      syncTarget: {
        ...ctx.values.syncTarget,
        targetConfig: { bucket: "another-bucket" },
      },
    });

    await expect(
      ctx.useCase.execute(createCommand(ctx)),
    ).rejects.toBeInstanceOf(InvalidDeviceRevocationTransitionError);

    expect(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects stale, missing, and duplicate survivor envelopes", async () => {
    const initialContext = createContext();
    const survivorSlot =
      initialContext.remoteSnapshot.keySlots.deviceSlots.at(0);

    if (survivorSlot === undefined) {
      throw new Error("Expected a survivor slot.");
    }

    const invalidSnapshots: VaultSnapshot[] = [
      {
        ...initialContext.remoteSnapshot,
        metadata: {
          ...initialContext.remoteSnapshot.metadata,
          vaultKeyGeneration: 1,
        },
      },
      {
        ...initialContext.remoteSnapshot,
        keySlots: { deviceSlots: [] },
      },
      {
        ...initialContext.remoteSnapshot,
        keySlots: {
          deviceSlots: [survivorSlot, survivorSlot],
        },
      },
    ];

    for (const remoteSnapshot of invalidSnapshots) {
      const ctx = createContext();
      vi.mocked(
        ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
      ).mockResolvedValue(
        toVaultSnapshotDescriptor(ctx.values.vaultId, remoteSnapshot),
      );
      vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
        remoteSnapshot,
      );

      await expect(
        ctx.useCase.execute({
          ...createCommand(ctx),
          remoteSnapshotDescriptor: toVaultSnapshotDescriptor(
            ctx.values.vaultId,
            remoteSnapshot,
          ),
        }),
      ).rejects.toBeInstanceOf(Error);

      expect(
        ctx.ports.crypto.decryptVaultSnapshotContent,
      ).not.toHaveBeenCalled();
    }
  });

  it("rejects a changed survivor wrapping identity", async () => {
    const ctx = createContext();
    const publicVaultKey = new Uint8Array([9]).buffer as DeviceVaultPublicKey;
    const certificates = ctx.remoteSnapshot.trustChain.certificates;
    const revocationCertificate = certificates.at(-1);

    if (revocationCertificate === undefined) {
      throw new Error("Expected a revocation certificate.");
    }
    const survivorIdentity = revocationCertificate.payload.trustedDevices.at(0);

    if (survivorIdentity === undefined) {
      throw new Error("Expected a survivor identity.");
    }

    const remoteSnapshot = {
      ...ctx.remoteSnapshot,
      trustChain: {
        certificates: [
          ...certificates.slice(0, -1),
          {
            ...revocationCertificate,
            payload: {
              ...revocationCertificate.payload,
              trustedDevices: [
                {
                  ...survivorIdentity,
                  publicVaultKey,
                },
              ],
            },
          },
        ],
      },
    };
    vi.mocked(ctx.ports.crypto.digestDevicePublicVaultKey).mockImplementation(
      async (key) => {
        if (key === publicVaultKey) {
          return "changed-vault-key-digest";
        }

        return key === ctx.values.pendingDevicePublicVaultKey
          ? "pending-device-public-vault-key-digest"
          : "device-public-vault-key-digest";
      },
    );
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(
      toVaultSnapshotDescriptor(ctx.values.vaultId, remoteSnapshot),
    );
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      remoteSnapshot,
    );

    await expect(
      ctx.useCase.execute({
        ...createCommand(ctx),
        remoteSnapshotDescriptor: toVaultSnapshotDescriptor(
          ctx.values.vaultId,
          remoteSnapshot,
        ),
      }),
    ).rejects.toBeInstanceOf(Error);

    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).not.toHaveBeenCalled();
  });

  it("does not stage credentials when local snapshot compare-and-set fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).mockRejectedValueOnce(
      new LocalVaultSnapshotChangedError(ctx.values.vaultId),
    );

    await expect(
      ctx.useCase.execute(createCommand(ctx)),
    ).rejects.toBeInstanceOf(LocalVaultSnapshotChangedError);

    expect(ctx.ports.saved.vaultSnapshot).toEqual(ctx.localSnapshot);
    expect(ctx.ports.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
  });

  it("rejects a revoked local device before vault decryption", async () => {
    const ctx = createContext();
    const certificates = ctx.remoteSnapshot.trustChain.certificates;
    const revocationCertificate = certificates.at(-1);

    if (revocationCertificate === undefined) {
      throw new Error("Expected a revocation certificate.");
    }

    const remoteSnapshot = {
      ...ctx.remoteSnapshot,
      metadata: {
        ...ctx.remoteSnapshot.metadata,
        createdByDeviceId: ctx.values.pendingDeviceId,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 2,
          [ctx.values.pendingDeviceId]: 1,
        },
      },
      trustChain: {
        certificates: [
          ...certificates.slice(0, -1),
          {
            ...revocationCertificate,
            payload: {
              ...revocationCertificate.payload,
              authorizedByDeviceId: ctx.values.pendingDeviceId,
              trustedDevices: [
                {
                  deviceId: ctx.values.pendingDeviceId,
                  publicSignKey: ctx.values.pendingDevicePublicSignKey,
                  publicVaultKey: ctx.values.pendingDevicePublicVaultKey,
                },
              ],
            },
          },
        ],
      },
      keySlots: {
        deviceSlots: [
          {
            deviceId: ctx.values.pendingDeviceId,
            vaultKeyGeneration: 2,
            envelope: {
              ...ctx.values.pendingDeviceVaultKeyEnvelope,
              vaultKeyGeneration: 2,
            },
          },
        ],
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(
      toVaultSnapshotDescriptor(ctx.values.vaultId, remoteSnapshot),
    );
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      remoteSnapshot,
    );

    await expect(
      ctx.useCase.execute({
        ...createCommand(ctx),
        remoteSnapshotDescriptor: toVaultSnapshotDescriptor(
          ctx.values.vaultId,
          remoteSnapshot,
        ),
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotNotFoundError);

    expect(ctx.ports.crypto.decryptVaultSnapshotContent).not.toHaveBeenCalled();
  });
});
