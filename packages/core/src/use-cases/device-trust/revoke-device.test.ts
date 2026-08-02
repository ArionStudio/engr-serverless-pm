import { describe, expect, it, vi } from "vitest";
import {
  createCoreTestPorts,
  replaceVaultSnapshotAfterNextSave,
} from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { singlePasswordEntry } from "../../__tests__/fixtures/vault-entries";
import type {
  VaultTrustChain,
  VerifiedVaultTrustState,
} from "../../domain/device-trust";
import type { UnlockedVault } from "../../domain/session";
import type { VaultSnapshot } from "../../domain/snapshot";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import { InvalidDeviceRevocationTransitionError } from "../../errors/device-revocation.errors";
import {
  ProviderCredentialRevocationPendingError,
  ReplacementSyncCredentialsRequiredError,
  ReplacementSyncCredentialsUnchangedError,
} from "../../errors/sync.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync";
import { RevokeDeviceUseCase } from "./revoke-device";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const targetIdentity = {
    deviceId: values.pendingDeviceId,
    publicSignKey: values.pendingDevicePublicSignKey,
    publicVaultKey: values.pendingDevicePublicVaultKey,
  };
  const trustChain: VaultTrustChain = {
    certificates: [
      ...values.vaultTrustChain.certificates,
      {
        payload: {
          version: 1,
          vaultId: values.vaultId,
          generation: 1,
          vaultKeyGeneration: 1,
          previousCertificateDigest: values.vaultTrustCertificateDigest,
          authorizedByDeviceId: values.deviceId,
          trustedDevices: [
            ...values.verifiedVaultTrustState.trustedDevices,
            targetIdentity,
          ],
        },
        signature: values.vaultTrustCertificateSignature,
      },
    ],
  };
  const trust: VerifiedVaultTrustState = {
    generation: 1,
    vaultKeyGeneration: 1,
    certificateDigest: values.vaultTrustCertificateDigest,
    trustedDevices: [
      ...values.verifiedVaultTrustState.trustedDevices,
      targetIdentity,
    ],
  };
  const vault = {
    ...values.decryptedVault,
    entries: [singlePasswordEntry],
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
        name: "Target",
        createdAt: values.timestamp,
        versionVector: { [values.deviceId]: 1 },
      },
    ],
  };
  const snapshot: VaultSnapshot = {
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
    trustChain,
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
  const unlockedVault: UnlockedVault = {
    vaultId: values.vaultId,
    deviceId: values.deviceId,
    vault,
    vaultMasterKey: values.vaultMasterKey,
    devicePrivateSignKey: values.devicePrivateSignKey,
    devicePrivateVaultKey: values.devicePrivateVaultKey,
    deviceLocalProtectionKey: values.deviceLocalProtectionKey,
    trustedSnapshotContext: {
      snapshotDigest: values.vaultSnapshotDigest,
      trust,
    },
    vaultTrustAnchor: values.vaultTrustAnchor,
  };
  ports.saved.vaultSnapshot = snapshot;
  ports.saved.vaultSnapshotDigest = values.vaultSnapshotDigest;
  ports.saved.deviceSyncCredentialState =
    values.encryptedDeviceSyncCredentialState;
  ports.saved.unlockedVaultSession = {
    sessionId: values.sessionId,
    unlockedVault,
    sourceSnapshotVersionVector: snapshot.metadata.snapshotVersionVector,
  };
  vi.mocked(ports.crypto.generateVaultMasterKey).mockResolvedValue(
    values.rotatedVaultMasterKey,
  );
  vi.mocked(
    ports.syncProvider.getLatestVaultSnapshotDescriptor,
  ).mockResolvedValue(toVaultSnapshotDescriptor(values.vaultId, snapshot));
  const snapshotService = new VaultSnapshotService(
    ports.crypto,
    ports.clock,
    ports.vaultLocalRepository,
  );
  const syncGuard = new VaultSyncGuardService(
    ports.syncProvider,
    snapshotService,
    ports.sessionServices.unlockedVaultSession,
    ports.crypto,
    ports.vaultLocalRepository,
  );
  const useCase = new RevokeDeviceUseCase(
    ports.clock,
    ports.crypto,
    ports.syncProvider,
    ports.sessionServices.unlockedVaultSession,
    syncGuard,
    snapshotService,
    ports.vaultLocalRepository,
  );

  return { values, ports, snapshot, useCase };
}

describe("RevokeDeviceUseCase", () => {
  it("uploads the signed revocation even when local storage replaces it after save", async () => {
    const ctx = createContext();
    const getPersistedSnapshot = replaceVaultSnapshotAfterNextSave(
      ctx.ports,
      ctx.snapshot,
    );

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      deviceId: ctx.values.pendingDeviceId,
      replacementSyncConfig: ctx.values.replacementSyncConfigInput,
    });

    const uploadedSnapshot = vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mock.calls[0]?.[1];
    expect(uploadedSnapshot).toBe(getPersistedSnapshot());
    expect(uploadedSnapshot).not.toBe(ctx.ports.saved.vaultSnapshot);
    expect(ctx.ports.saved.vaultSnapshot).toBe(ctx.snapshot);
  });

  it("rotates the vault key and creates envelopes only for survivors", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      deviceId: ctx.values.pendingDeviceId,
      replacementSyncConfig: ctx.values.replacementSyncConfigInput,
    });

    expect(ctx.ports.crypto.generateVaultMasterKey).toHaveBeenCalledOnce();
    expect(ctx.ports.crypto.encryptVaultSnapshotContent).toHaveBeenCalledWith(
      expect.anything(),
      ctx.values.rotatedVaultMasterKey,
    );
    expect(ctx.ports.saved.vaultSnapshot?.metadata.vaultKeyGeneration).toBe(2);
    expect(ctx.ports.saved.vaultSnapshot?.keySlots.deviceSlots).toHaveLength(1);
    expect(
      ctx.ports.saved.vaultSnapshot?.keySlots.deviceSlots.some(
        (slot) => slot.deviceId === ctx.values.pendingDeviceId,
      ),
    ).toBe(false);
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.replacementSyncAccess,
      expect.anything(),
      toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.snapshot),
    );
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        syncCredentialState:
          ctx.values.replacementEncryptedDeviceSyncCredentialState,
      }),
    );
    expect(result.providerCredentialRevocation).toBe(
      "pending_external_disable",
    );
    expect(result.vault.entries[0]).toEqual({
      id: singlePasswordEntry.id,
      login: singlePasswordEntry.login,
      tags: singlePasswordEntry.tags,
      sanitizedUrl: singlePasswordEntry.sanitizedUrl,
    });
    expect(result.vault.entries[0]).not.toHaveProperty("password");
    expect(result.vault).not.toHaveProperty("syncTarget");
    expect(result.vault).not.toHaveProperty(
      "providerCredentialRevocationPending",
    );
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault
        .providerCredentialRevocationPending,
    ).toEqual({
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      vaultKeyGeneration: 2,
    });

    const persistedVersionVector =
      ctx.ports.saved.vaultSnapshot?.metadata.snapshotVersionVector;

    if (persistedVersionVector === undefined) {
      throw new Error("Expected a persisted revocation snapshot.");
    }

    const expectedVersionVector = { ...persistedVersionVector };
    result.snapshotVersionVector[ctx.values.deviceId] = 99;

    expect(
      ctx.ports.saved.vaultSnapshot?.metadata.snapshotVersionVector,
    ).toEqual(expectedVersionVector);
    expect(
      ctx.ports.saved.unlockedVaultSession?.sourceSnapshotVersionVector,
    ).toEqual(expectedVersionVector);
  });

  it("rejects another revocation while the shared provider marker is pending", async () => {
    const ctx = createContext();
    const session = ctx.ports.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("test session missing");
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

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toBeInstanceOf(ProviderCredentialRevocationPendingError);

    expect(ctx.ports.crypto.generateVaultMasterKey).not.toHaveBeenCalled();
  });

  it("requires replacement credentials for a synced vault", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
      }),
    ).rejects.toBeInstanceOf(ReplacementSyncCredentialsRequiredError);

    expect(ctx.ports.crypto.generateVaultMasterKey).not.toHaveBeenCalled();
  });

  it("rejects the current provider credential as its own replacement", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.setup).mockResolvedValue(
      ctx.values.syncAccess,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        replacementSyncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(ReplacementSyncCredentialsUnchangedError);

    expect(ctx.ports.crypto.generateVaultMasterKey).not.toHaveBeenCalled();
    expect(ctx.ports.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
  });

  it("restores the old snapshot and credentials when upload fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValue(
      new Error("upload failed"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toThrow("upload failed");

    expect(ctx.ports.saved.vaultSnapshot?.metadata.vaultKeyGeneration).toBe(1);
    expect(ctx.ports.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vaultMasterKey,
    ).toBe(ctx.values.vaultMasterKey);
  });

  it("restores the old state when the session expires during upload", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(async () => {
      await ctx.ports.sessionServices.unlockedVaultSession.remove();
      throw new Error("upload failed");
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toThrow("upload failed");

    expect(ctx.ports.saved.vaultSnapshot).toEqual(ctx.snapshot);
    expect(ctx.ports.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it.each([
    ["vault key generation", "generateVaultMasterKey"],
    ["survivor envelope creation", "createDeviceVaultKeyEnvelope"],
  ] as const)(
    "leaves the previous state usable when %s fails",
    async (_failure, method) => {
      const ctx = createContext();
      vi.mocked(ctx.ports.crypto[method]).mockRejectedValueOnce(
        new Error(`${method} failed`),
      );

      await expect(
        ctx.useCase.execute({
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.pendingDeviceId,
          replacementSyncConfig: ctx.values.replacementSyncConfigInput,
        }),
      ).rejects.toThrow(`${method} failed`);

      expect(ctx.ports.saved.vaultSnapshot).toEqual(ctx.snapshot);
      expect(ctx.ports.saved.deviceSyncCredentialState).toBe(
        ctx.values.encryptedDeviceSyncCredentialState,
      );
      expect(
        ctx.ports.saved.unlockedVaultSession?.unlockedVault.vaultMasterKey,
      ).toBe(ctx.values.vaultMasterKey);
    },
  );

  it("leaves credentials unchanged when rotated snapshot persistence fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).mockRejectedValueOnce(new Error("snapshot persistence failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toThrow("snapshot persistence failed");

    expect(ctx.ports.saved.vaultSnapshot).toEqual(ctx.snapshot);
    expect(ctx.ports.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
  });

  it("invalidates the session when upload rollback cannot be persisted", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(async () => {
      ctx.ports.saved.vaultSnapshotDigest = "concurrent-snapshot-digest";
      throw new Error("upload failed");
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toThrow("upload failed");

    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("retains the rotated state and invalidates the session when post-upload session commit fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(new Error("session commit failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toThrow("session commit failed");

    expect(ctx.ports.saved.vaultSnapshot?.metadata.vaultKeyGeneration).toBe(2);
    expect(ctx.ports.saved.deviceSyncCredentialState).toBe(
      ctx.values.replacementEncryptedDeviceSyncCredentialState,
    );
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("can revoke an authorized device that has not created a profile yet", async () => {
    const ctx = createContext();
    const session = ctx.ports.saved.unlockedVaultSession;
    if (session === undefined) {
      throw new Error("test session missing");
    }
    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          deviceProfiles: session.unlockedVault.vault.deviceProfiles.filter(
            (profile) => profile.id !== ctx.values.pendingDeviceId,
          ),
        },
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).resolves.toMatchObject({
      providerCredentialRevocation: "pending_external_disable",
    });
  });

  it("rejects a trusted device whose profile is already tombstoned", async () => {
    const ctx = createContext();
    const session = ctx.ports.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("test session missing");
    }

    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          deviceProfiles: session.unlockedVault.vault.deviceProfiles.filter(
            (profile) => profile.id !== ctx.values.pendingDeviceId,
          ),
          deletedDeviceProfiles: [
            ...session.unlockedVault.vault.deletedDeviceProfiles,
            {
              id: ctx.values.pendingDeviceId,
              versionVector: { [ctx.values.deviceId]: 2 },
              deletedAt: ctx.values.timestamp,
            },
          ],
        },
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toBeInstanceOf(InvalidDeviceRevocationTransitionError);

    expect(ctx.ports.syncProvider.setup).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.generateVaultMasterKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a local tombstone for a device absent from trust history", async () => {
    const ctx = createContext();
    const session = ctx.ports.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("test session missing");
    }

    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          deletedDeviceProfiles: [
            ...session.unlockedVault.vault.deletedDeviceProfiles,
            {
              id: "never-trusted-device",
              versionVector: { [ctx.values.deviceId]: 2 },
              deletedAt: ctx.values.timestamp,
            },
          ],
        },
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        replacementSyncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toBeInstanceOf(InvalidDeviceRevocationTransitionError);

    expect(ctx.ports.syncProvider.setup).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.generateVaultMasterKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });
});
