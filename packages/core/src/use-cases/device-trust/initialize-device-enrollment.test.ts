import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import type {
  DevicePublicSignKey,
  DeviceVaultPublicKey,
} from "../../domain/device-trust";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceEnrollmentIntegrityError,
  DeviceEnrollmentVaultNotSynchronizedError,
} from "../../errors/device-enrollment.errors";
import { ProviderCredentialRevocationPendingError } from "../../errors/sync.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync";
import { InitializeDeviceEnrollmentUseCase } from "./initialize-device-enrollment";

function createContext() {
  const ctx = createUnlockVaultTestContext();
  ctx.saved.unlockedVaultSession = {
    sessionId: ctx.values.sessionId,
    unlockedVault: createUnlockedVaultWithEntries(ctx.values, []),
    sourceSnapshotVersionVector:
      ctx.vaultSnapshot.metadata.snapshotVersionVector,
  };
  const snapshotService = new VaultSnapshotService(
    ctx.ports.crypto,
    ctx.ports.clock,
    ctx.ports.vaultLocalRepository,
  );
  const syncGuard = new VaultSyncGuardService(
    ctx.ports.syncProvider,
    snapshotService,
    ctx.ports.sessionServices.unlockedVaultSession,
    ctx.ports.crypto,
    ctx.ports.vaultLocalRepository,
  );
  const useCase = new InitializeDeviceEnrollmentUseCase(
    ctx.ports.crypto,
    ctx.ports.sessionServices.unlockedVaultSession,
    syncGuard,
    snapshotService,
  );

  return { ...ctx, useCase };
}

describe("InitializeDeviceEnrollmentUseCase", () => {
  it("authorizes a signed public request and creates a normal target envelope", async () => {
    const ctx = createContext();

    const response = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      request: ctx.values.enrollmentRequest,
    });

    expect(
      ctx.ports.crypto.verifyDeviceEnrollmentRequestSignature,
    ).toHaveBeenCalledWith(ctx.values.enrollmentRequest);
    expect(ctx.ports.crypto.createDeviceVaultKeyEnvelope).toHaveBeenCalledWith(
      ctx.values.vaultMasterKey,
      ctx.values.pendingDevicePublicVaultKey,
      {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        vaultKeyGeneration: 1,
        algorithmSuiteId: "spm-v1",
      },
    );
    expect(response.snapshot.keySlots.deviceSlots).toHaveLength(2);
    expect(response.snapshot.keySlots.deviceSlots[1]).toMatchObject({
      deviceId: ctx.values.pendingDeviceId,
      vaultKeyGeneration: 1,
    });
    expect(response).not.toHaveProperty("devicePrivateSignKey");
    expect(response).not.toHaveProperty("devicePrivateVaultKey");
    expect(response).not.toHaveProperty("credentials");
  });

  it("rejects an invalid request self-signature before mutation", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.verifyDeviceEnrollmentRequestSignature,
    ).mockResolvedValue(false);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        request: ctx.values.enrollmentRequest,
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentIntegrityError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects an enrollment request for another algorithm suite", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        request: {
          ...ctx.values.enrollmentRequest,
          payload: {
            ...ctx.values.enrollmentRequest.payload,
            algorithmSuiteId: "another-suite",
          },
        },
      }),
    ).rejects.toBeInstanceOf(UnsupportedAlgorithmSuiteError);

    expect(
      ctx.ports.crypto.verifyDeviceEnrollmentRequestSignature,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects a request pinned to another trust anchor", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        request: {
          ...ctx.values.enrollmentRequest,
          payload: {
            ...ctx.values.enrollmentRequest.payload,
            expectedGenesisCertificateDigest: "another-genesis-digest",
          },
        },
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentIntegrityError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects authorization when the remote snapshot differs from local state", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    ctx.saved.deviceSyncCredentialState =
      ctx.values.encryptedDeviceSyncCredentialState;
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue({
      ...toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.vaultSnapshot),
      snapshotVersionVector: { [ctx.values.deviceId]: 0 },
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        request: ctx.values.enrollmentRequest,
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentVaultNotSynchronizedError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("does not generate target keys on the registered device", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      request: ctx.values.enrollmentRequest,
    });

    expect(ctx.ports.crypto.generateDeviceSignKeyPair).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.generateDeviceVaultKeyPair).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.generateDeviceLocalProtectionKey,
    ).not.toHaveBeenCalled();
  });

  it("refreshes a matching current enrollment without mutation", async () => {
    const ctx = createContext();
    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      request: ctx.values.enrollmentRequest,
    });
    const currentSnapshot = ctx.ports.saved.vaultSnapshot;

    if (currentSnapshot === undefined) {
      throw new Error("Expected an authorized enrollment snapshot.");
    }

    vi.mocked(ctx.ports.crypto.signVaultTrustCertificate).mockClear();
    vi.mocked(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).mockClear();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockClear();
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).mockClear();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        request: ctx.values.enrollmentRequest,
      }),
    ).resolves.toMatchObject({
      requestId: ctx.values.requestId,
      snapshot: currentSnapshot,
    });

    expect(ctx.ports.crypto.signVaultTrustCertificate).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("refreshes a current enrollment after an unrelated device revocation", async () => {
    const ctx = createContext();
    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      request: ctx.values.enrollmentRequest,
    });
    const session = ctx.ports.saved.unlockedVaultSession;
    const currentSnapshot = ctx.ports.saved.vaultSnapshot;

    if (session === undefined || currentSnapshot === undefined) {
      throw new Error("Expected an authorized enrollment.");
    }

    const otherPublicSignKey = new Uint8Array([3])
      .buffer as DevicePublicSignKey;
    const otherPublicVaultKey = new Uint8Array([4])
      .buffer as DeviceVaultPublicKey;
    const otherDeviceId = "other-device";
    const otherIdentity = {
      deviceId: otherDeviceId,
      publicSignKey: otherPublicSignKey,
      publicVaultKey: otherPublicVaultKey,
    };
    const enrolledDevices = [
      ...session.unlockedVault.trustedSnapshotContext.trust.trustedDevices,
      otherIdentity,
    ];
    const finalSnapshot = {
      ...currentSnapshot,
      metadata: {
        ...currentSnapshot.metadata,
        snapshotVersionVector: { [ctx.values.deviceId]: 4 },
        vaultKeyGeneration: 2,
      },
      trustChain: {
        certificates: [
          ...currentSnapshot.trustChain.certificates,
          {
            payload: {
              version: 1 as const,
              vaultId: ctx.values.vaultId,
              generation: 2,
              vaultKeyGeneration: 1,
              previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
              authorizedByDeviceId: ctx.values.deviceId,
              trustedDevices: enrolledDevices,
            },
            signature: ctx.values.vaultTrustCertificateSignature,
          },
          {
            payload: {
              version: 1 as const,
              vaultId: ctx.values.vaultId,
              generation: 3,
              vaultKeyGeneration: 2,
              previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
              authorizedByDeviceId: ctx.values.deviceId,
              trustedDevices:
                session.unlockedVault.trustedSnapshotContext.trust
                  .trustedDevices,
            },
            signature: ctx.values.vaultTrustCertificateSignature,
          },
        ],
      },
      keySlots: {
        deviceSlots: currentSnapshot.keySlots.deviceSlots.map((slot) => ({
          ...slot,
          vaultKeyGeneration: 2,
          envelope: {
            ...slot.envelope,
            vaultKeyGeneration: 2,
          },
        })),
      },
    };
    vi.mocked(ctx.ports.crypto.digestDevicePublicSignKey).mockImplementation(
      async (key) =>
        key === otherPublicSignKey
          ? "other-sign"
          : key === ctx.values.pendingDevicePublicSignKey
            ? "pending-sign"
            : "initial-sign",
    );
    vi.mocked(ctx.ports.crypto.digestDevicePublicVaultKey).mockImplementation(
      async (key) =>
        key === otherPublicVaultKey
          ? "other-vault"
          : key === ctx.values.pendingDevicePublicVaultKey
            ? "pending-vault"
            : "initial-vault",
    );
    ctx.ports.saved.vaultSnapshot = finalSnapshot;
    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      sourceSnapshotVersionVector: finalSnapshot.metadata.snapshotVersionVector,
      unlockedVault: {
        ...session.unlockedVault,
        trustedSnapshotContext: {
          ...session.unlockedVault.trustedSnapshotContext,
          trust: {
            ...session.unlockedVault.trustedSnapshotContext.trust,
            generation: 3,
            vaultKeyGeneration: 2,
          },
        },
      },
    };
    vi.mocked(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).mockClear();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        request: ctx.values.enrollmentRequest,
      }),
    ).resolves.toMatchObject({
      snapshot: finalSnapshot,
    });

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects a refresh whose public keys differ from the trusted identity", async () => {
    const ctx = createContext();
    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      request: ctx.values.enrollmentRequest,
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        request: {
          ...ctx.values.enrollmentRequest,
          payload: {
            ...ctx.values.enrollmentRequest.payload,
            publicVaultKey: ctx.values.devicePublicVaultKey,
          },
        },
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentIntegrityError);
  });

  it("rejects a request for a previously revoked device identity", async () => {
    const ctx = createContext();
    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      request: ctx.values.enrollmentRequest,
    });
    const session = ctx.ports.saved.unlockedVaultSession;
    const currentSnapshot = ctx.ports.saved.vaultSnapshot;

    if (session === undefined || currentSnapshot === undefined) {
      throw new Error("Expected an authorized enrollment.");
    }

    const survivorSlot = currentSnapshot.keySlots.deviceSlots.find(
      (slot) => slot.deviceId === ctx.values.deviceId,
    );

    if (survivorSlot === undefined) {
      throw new Error("Expected the authorizing device key slot.");
    }

    const revokedSnapshot = {
      ...currentSnapshot,
      metadata: {
        ...currentSnapshot.metadata,
        snapshotVersionVector: { [ctx.values.deviceId]: 3 },
        vaultKeyGeneration: 2,
      },
      trustChain: {
        certificates: [
          ...currentSnapshot.trustChain.certificates,
          {
            payload: {
              version: 1 as const,
              vaultId: ctx.values.vaultId,
              generation: 2,
              vaultKeyGeneration: 2,
              previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
              authorizedByDeviceId: ctx.values.deviceId,
              trustedDevices: ctx.values.verifiedVaultTrustState.trustedDevices,
            },
            signature: ctx.values.vaultTrustCertificateSignature,
          },
        ],
      },
      keySlots: {
        deviceSlots: [
          {
            ...survivorSlot,
            vaultKeyGeneration: 2,
            envelope: {
              ...ctx.values.vaultKeyEnvelope,
              vaultKeyGeneration: 2,
            },
          },
        ],
      },
    };
    ctx.ports.saved.vaultSnapshot = revokedSnapshot;
    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      sourceSnapshotVersionVector:
        revokedSnapshot.metadata.snapshotVersionVector,
      unlockedVault: {
        ...session.unlockedVault,
        trustedSnapshotContext: {
          ...session.unlockedVault.trustedSnapshotContext,
          trust: {
            ...ctx.values.verifiedVaultTrustState,
            generation: 2,
            vaultKeyGeneration: 2,
          },
        },
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        request: ctx.values.enrollmentRequest,
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentIntegrityError);
  });

  it("allows a read-only refresh while old provider credentials await disabling", async () => {
    const ctx = createContext();
    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      request: ctx.values.enrollmentRequest,
    });
    const session = ctx.ports.saved.unlockedVaultSession;
    const currentSnapshot = ctx.ports.saved.vaultSnapshot;

    if (session === undefined || currentSnapshot === undefined) {
      throw new Error("Expected an authorized enrollment.");
    }

    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    ctx.ports.saved.deviceSyncCredentialState =
      ctx.values.replacementEncryptedDeviceSyncCredentialState;
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(
      toVaultSnapshotDescriptor(ctx.values.vaultId, currentSnapshot),
    );
    vi.mocked(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).mockClear();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        request: ctx.values.enrollmentRequest,
      }),
    ).resolves.toMatchObject({
      snapshot: currentSnapshot,
    });

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects enrollment while old provider credentials still await disabling", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
          providerCredentialRevocationPending: {
            revokedDeviceIds: [ctx.values.pendingDeviceId],
            vaultKeyGeneration: 1,
          },
        },
      },
    };
    ctx.saved.deviceSyncCredentialState =
      ctx.values.encryptedDeviceSyncCredentialState;
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(
      toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.vaultSnapshot),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        request: ctx.values.enrollmentRequest,
      }),
    ).rejects.toBeInstanceOf(ProviderCredentialRevocationPendingError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });
});
