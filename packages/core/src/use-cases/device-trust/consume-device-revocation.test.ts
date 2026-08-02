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
import {
  CurrentDeviceRevokedError,
  InvalidDeviceRevocationTransitionError,
} from "../../errors/device-revocation.errors";
import {
  LocalSyncCredentialsMissingError,
  PreviousSyncCredentialStillActiveError,
  RemoteVaultSnapshotChangedError,
  ReplacementSyncCredentialsUnchangedError,
  SyncConflictDetectedError,
  SyncResolutionIncompleteError,
} from "../../errors/sync.errors";
import { UnlockedVaultSessionExpiredError } from "../../errors/vault-session.errors";
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
  const remoteVault = {
    ...revokeDeviceProfileFromVault(
      localVault,
      values.deviceId,
      values.pendingDeviceId,
      values.timestamp + 1,
    ),
    providerCredentialRevocationPending: {
      revokedDeviceIds: [values.pendingDeviceId],
      vaultKeyGeneration: 2,
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
  readonly localSnapshot: VaultSnapshot;
  readonly remoteSnapshot: VaultSnapshot;
}) {
  return {
    vaultId: ctx.values.vaultId,
    replacementSyncConfig: ctx.values.replacementSyncConfigInput,
    reviewedSnapshotDescriptors: {
      local: toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.localSnapshot),
      remote: toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.remoteSnapshot),
    },
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
      ctx.ports.vaultLocalRepository,
    );

    const result = await useCase.execute({
      vaultId: ctx.values.vaultId,
      replacementSyncConfig: ctx.values.replacementSyncConfigInput,
    });

    expect(result).toMatchObject({
      reviewedSnapshotDescriptors: {
        local: toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.localSnapshot),
      },
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

  it("replaces a locally stale completed marker through verified revocation consumption", async () => {
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
            revokedDeviceIds: ["previously-revoked-device"],
            vaultKeyGeneration: 1,
          },
        },
      },
    };
    const olderCredentials = {
      provider: "aws-s3-v1",
      credentialsConfig: {
        accessKeyId: "older-access-key",
        secretAccessKey: "older-secret-key",
      },
    } as const;
    vi.mocked(
      ctx.ports.crypto.decryptDeviceSyncCredentialState,
    ).mockResolvedValueOnce({
      currentCredentials: ctx.values.syncCredentials,
      previousCredentials: {
        credentials: olderCredentials,
        revokedDeviceIds: ["previously-revoked-device"],
        vaultKeyGeneration: 1,
      },
    });
    const useCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      useCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).resolves.toMatchObject({
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      vaultKeyGeneration: 2,
    });
    expect(ctx.ports.syncProvider.checkVaultAccess).toHaveBeenCalledWith(
      {
        target: ctx.values.syncTarget,
        credentials: olderCredentials,
      },
      ctx.values.vaultId,
    );
  });

  it("rejects preparation when local sync credentials are missing", async () => {
    const ctx = createContext();
    ctx.ports.saved.deviceSyncCredentialState = undefined;
    const useCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      useCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toBeInstanceOf(LocalSyncCredentialsMissingError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
  });

  it("rejects preparation while provider credential revocation is pending", async () => {
    const ctx = createContext();
    ctx.ports.saved.deviceSyncCredentialState =
      ctx.values.replacementEncryptedDeviceSyncCredentialState;
    vi.mocked(ctx.ports.syncProvider.checkVaultAccess).mockResolvedValue(
      "accessible",
    );
    const useCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      useCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toBeInstanceOf(PreviousSyncCredentialStillActiveError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
  });

  it("rejects preparation with the current local credentials", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.setup).mockResolvedValue(
      ctx.values.syncAccess,
    );
    const useCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      useCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toBeInstanceOf(ReplacementSyncCredentialsUnchangedError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
  });

  it("rejects preparation with the locally retained previous credentials", async () => {
    const ctx = createContext();
    ctx.ports.saved.deviceSyncCredentialState =
      ctx.values.replacementEncryptedDeviceSyncCredentialState;
    vi.mocked(ctx.ports.syncProvider.setup).mockResolvedValue({
      target: ctx.values.syncTarget,
      credentials: ctx.values.syncCredentials,
    });
    const useCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      useCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toBeInstanceOf(ReplacementSyncCredentialsUnchangedError);

    expect(ctx.ports.syncProvider.checkVaultAccess).toHaveBeenCalled();
    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
  });

  it("rejects duplicate local profiles for the revoked device", async () => {
    const ctx = createContext();
    const session = ctx.ports.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    const targetProfile = session.unlockedVault.vault.deviceProfiles.find(
      (profile) => profile.id === ctx.values.pendingDeviceId,
    );

    if (targetProfile === undefined) {
      throw new Error("Expected a target device profile.");
    }

    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          deviceProfiles: [
            ...session.unlockedVault.vault.deviceProfiles,
            { ...targetProfile },
          ],
        },
      },
    };
    const useCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      useCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toBeInstanceOf(InvalidDeviceRevocationTransitionError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a provider marker that does not match the final revocation", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.remoteVault,
      providerCredentialRevocationPending: {
        revokedDeviceIds: ["another-device"],
        vaultKeyGeneration: 2,
      },
    });
    const useCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      useCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toMatchObject({
      name: "InvalidDeviceRevocationTransitionError",
      message: expect.stringContaining("provider credential revocation marker"),
    });

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects a provider marker bound to another vault-key generation", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.remoteVault,
      providerCredentialRevocationPending: {
        revokedDeviceIds: [ctx.values.pendingDeviceId],
        vaultKeyGeneration: 1,
      },
    });
    const useCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      useCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toMatchObject({
      name: "InvalidDeviceRevocationTransitionError",
      message: expect.stringContaining("provider credential revocation marker"),
    });

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("accepts a revocation snapshot whose provider marker was already cleared", async () => {
    const ctx = createContext();
    const { providerCredentialRevocationPending, ...remoteVault } =
      ctx.remoteVault;
    void providerCredentialRevocationPending;
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
      remoteVault,
    );
    const useCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      useCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).resolves.toMatchObject({
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      vaultKeyGeneration: 2,
    });

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects duplicate remote profiles for a trusted survivor", async () => {
    const ctx = createContext();
    const survivorProfile = ctx.remoteVault.deviceProfiles.find(
      (profile) => profile.id === ctx.values.deviceId,
    );

    if (survivorProfile === undefined) {
      throw new Error("Expected a survivor device profile.");
    }

    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.remoteVault,
      deviceProfiles: [
        ...ctx.remoteVault.deviceProfiles,
        { ...survivorProfile },
      ],
    });
    const useCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      useCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toBeInstanceOf(InvalidDeviceRevocationTransitionError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).not.toHaveBeenCalled();
  });
});

describe("ConsumeDeviceRevocationUseCase", () => {
  it("opens the survivor envelope and commits the rotated snapshot", async () => {
    const ctx = createContext();
    const survivorSlot = ctx.remoteSnapshot.keySlots.deviceSlots[0];

    if (survivorSlot === undefined) {
      throw new Error("Expected a survivor slot.");
    }

    const result = await ctx.useCase.execute(createCommand(ctx));

    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).toHaveBeenCalledWith(
      survivorSlot.envelope,
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
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault
        .providerCredentialRevocationPending,
    ).toEqual({
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      vaultKeyGeneration: 2,
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
    const survivorSlot = localSnapshot.keySlots.deviceSlots.at(0);

    if (survivorSlot === undefined) {
      throw new Error("Expected a survivor slot.");
    }

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
            ...survivorSlot,
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
        reviewedSnapshotDescriptors: {
          local: toVaultSnapshotDescriptor(ctx.values.vaultId, localSnapshot),
          remote: toVaultSnapshotDescriptor(ctx.values.vaultId, remoteSnapshot),
        },
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

  it("consumes an enrollment followed by a revocation from one final snapshot", async () => {
    const ctx = createContext();
    const session = ctx.ports.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    const enrolledDeviceId = "new-survivor";
    const enrolledPublicSignKey = new Uint8Array([7])
      .buffer as DevicePublicSignKey;
    const enrolledPublicVaultKey = new Uint8Array([8])
      .buffer as DeviceVaultPublicKey;
    const enrolledIdentity = {
      deviceId: enrolledDeviceId,
      publicSignKey: enrolledPublicSignKey,
      publicVaultKey: enrolledPublicVaultKey,
    };
    const enrollmentCertificate = {
      payload: {
        version: 1 as const,
        vaultId: ctx.values.vaultId,
        generation: 2,
        vaultKeyGeneration: 1,
        previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
        authorizedByDeviceId: ctx.values.deviceId,
        trustedDevices: [
          ...session.unlockedVault.trustedSnapshotContext.trust.trustedDevices,
          enrolledIdentity,
        ],
      },
      signature: ctx.values.vaultTrustCertificateSignature,
    };
    const revocationCertificate = {
      payload: {
        version: 1 as const,
        vaultId: ctx.values.vaultId,
        generation: 3,
        vaultKeyGeneration: 2,
        previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
        authorizedByDeviceId: ctx.values.deviceId,
        trustedDevices: [
          ...ctx.values.verifiedVaultTrustState.trustedDevices,
          enrolledIdentity,
        ],
      },
      signature: ctx.values.vaultTrustCertificateSignature,
    };
    const survivorSlot = ctx.localSnapshot.keySlots.deviceSlots[0];

    if (survivorSlot === undefined) {
      throw new Error("Expected a survivor slot.");
    }

    const remoteSnapshot: VaultSnapshot = {
      ...ctx.remoteSnapshot,
      metadata: {
        ...ctx.remoteSnapshot.metadata,
        snapshotVersionVector: { [ctx.values.deviceId]: 4 },
      },
      trustChain: {
        certificates: [
          ...ctx.localSnapshot.trustChain.certificates,
          enrollmentCertificate,
          revocationCertificate,
        ],
      },
      keySlots: {
        deviceSlots: [
          {
            ...survivorSlot,
            vaultKeyGeneration: 2,
            envelope: {
              ...survivorSlot.envelope,
              vaultKeyGeneration: 2,
            },
          },
          {
            deviceId: enrolledDeviceId,
            vaultKeyGeneration: 2,
            envelope: {
              ...ctx.values.pendingDeviceVaultKeyEnvelope,
              recipientDeviceId: enrolledDeviceId,
              vaultKeyGeneration: 2,
            },
          },
        ],
      },
    };
    const revokedVault = revokeDeviceProfileFromVault(
      session.unlockedVault.vault,
      ctx.values.deviceId,
      ctx.values.pendingDeviceId,
      ctx.values.timestamp + 1,
    );
    const remoteVault = {
      ...revokedVault,
      deviceProfiles: [
        ...revokedVault.deviceProfiles,
        {
          id: enrolledDeviceId,
          name: "New survivor",
          createdAt: ctx.values.timestamp + 1,
          versionVector: { [enrolledDeviceId]: 1 },
        },
      ],
    };
    vi.mocked(ctx.ports.crypto.digestDevicePublicSignKey).mockImplementation(
      async (key) => {
        if (key === ctx.values.pendingDevicePublicSignKey) {
          return "pending-sign";
        }

        return key === enrolledPublicSignKey ? "enrolled-sign" : "initial-sign";
      },
    );
    vi.mocked(ctx.ports.crypto.digestDevicePublicVaultKey).mockImplementation(
      async (key) => {
        if (key === ctx.values.pendingDevicePublicVaultKey) {
          return "pending-vault";
        }

        return key === enrolledPublicVaultKey
          ? "enrolled-vault"
          : "initial-vault";
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
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
      remoteVault,
    );
    const prepareUseCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      prepareUseCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).resolves.toMatchObject({
      enrolledDeviceIds: [enrolledDeviceId],
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      review: {
        deviceProfileReviews: [],
      },
    });

    await expect(
      ctx.useCase.execute({
        ...createCommand(ctx),
        reviewedSnapshotDescriptors: {
          ...createCommand(ctx).reviewedSnapshotDescriptors,
          remote: toVaultSnapshotDescriptor(ctx.values.vaultId, remoteSnapshot),
        },
      }),
    ).resolves.toMatchObject({
      enrolledDeviceIds: [enrolledDeviceId],
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      vaultKeyGeneration: 2,
    });

    expect(ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault).toEqual(
      remoteVault,
    );
  });

  it("captures and applies normal sync resolution after revocation", async () => {
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
    const command = {
      ...createCommand(ctx),
      resolution: {
        entryResolutions: [],
        tagResolutions: [{ tagId: 1, action: "use_remote" as const }],
        deviceProfileResolutions: [],
      },
    };
    vi.mocked(
      ctx.ports.crypto.decryptVaultSnapshotContent,
    ).mockImplementationOnce(async () => {
      command.resolution.tagResolutions.length = 0;

      return { ...remoteVault };
    });

    await expect(ctx.useCase.execute(command)).resolves.toMatchObject({
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

  it("rejects when the local descriptor changed after review", async () => {
    const ctx = createContext();
    const command = createCommand(ctx);

    await expect(
      ctx.useCase.execute({
        ...command,
        reviewedSnapshotDescriptors: {
          ...command.reviewedSnapshotDescriptors,
          local: {
            ...command.reviewedSnapshotDescriptors.local,
            revisionTimestamp:
              command.reviewedSnapshotDescriptors.local.revisionTimestamp - 1,
          },
        },
      }),
    ).rejects.toBeInstanceOf(LocalVaultSnapshotChangedError);

    expect(ctx.ports.syncProvider.setup).not.toHaveBeenCalled();
    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).not.toHaveBeenCalled();
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

  it("accepts a final tombstone for an identity pending in the local vault", async () => {
    const ctx = createContext();
    const session = ctx.ports.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    const pendingLocalVault = {
      ...session.unlockedVault.vault,
      deviceProfiles: session.unlockedVault.vault.deviceProfiles.filter(
        (profile) => profile.id !== ctx.values.pendingDeviceId,
      ),
    };
    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: pendingLocalVault,
      },
    };
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...pendingLocalVault,
      deletedDeviceProfiles: [
        {
          id: ctx.values.pendingDeviceId,
          deletedAt: ctx.values.timestamp + 1,
          versionVector: { [ctx.values.deviceId]: 3 },
        },
      ],
    });
    const prepareUseCase = new PrepareDeviceRevocationConsumptionUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.snapshotService,
      ctx.ports.vaultLocalRepository,
    );

    await expect(
      prepareUseCase.execute({
        vaultId: ctx.values.vaultId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).resolves.toMatchObject({
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      review: {
        deviceProfileReviews: [],
      },
    });

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
          reviewedSnapshotDescriptors: {
            ...createCommand(ctx).reviewedSnapshotDescriptors,
            remote: toVaultSnapshotDescriptor(
              ctx.values.vaultId,
              remoteSnapshot,
            ),
          },
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
        reviewedSnapshotDescriptors: {
          ...createCommand(ctx).reviewedSnapshotDescriptors,
          remote: toVaultSnapshotDescriptor(ctx.values.vaultId, remoteSnapshot),
        },
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

  it("does not persist the remote snapshot after the unlocked session expires", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).mockImplementationOnce(async () => {
      await ctx.ports.sessionServices.unlockedVaultSession.remove();
      return ctx.values.replacementEncryptedDeviceSyncCredentialState;
    });

    await expect(
      ctx.useCase.execute(createCommand(ctx)),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.vaultSnapshot).toEqual(ctx.localSnapshot);
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
        reviewedSnapshotDescriptors: {
          ...createCommand(ctx).reviewedSnapshotDescriptors,
          remote: toVaultSnapshotDescriptor(ctx.values.vaultId, remoteSnapshot),
        },
      }),
    ).rejects.toBeInstanceOf(CurrentDeviceRevokedError);

    expect(ctx.ports.crypto.decryptVaultSnapshotContent).not.toHaveBeenCalled();
  });
});
