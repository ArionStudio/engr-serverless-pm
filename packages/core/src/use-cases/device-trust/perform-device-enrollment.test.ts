import { describe, expect, it, vi } from "vitest";
import {
  createCoreTestPorts,
  replaceVaultSnapshotAfterNextInitializedSave,
} from "../../__tests__/fixtures/ports";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { singlePasswordEntry } from "../../__tests__/fixtures/vault-entries";
import type {
  DeviceEnrollmentResponse,
  PendingDeviceEnrollment,
  VaultTrustChain,
} from "../../domain/device-trust";
import type { RawMasterPassword } from "../../domain/master-password";
import type { VaultSnapshot } from "../../domain/snapshot";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import {
  DeviceEnrollmentRollbackIncompleteError,
  DeviceEnrollmentIntegrityError,
  DeviceEnrollmentRemoteSnapshotChangedError,
  PendingDeviceEnrollmentMismatchError,
} from "../../errors/device-enrollment.errors";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
import {
  RemoteVaultSnapshotChangedError,
  SyncRemovalPendingError,
} from "../../errors/sync.errors";
import { LocalVaultAlreadyInitializedError } from "../../errors/vault-lifecycle.errors";
import { PerformDeviceEnrollmentUseCase } from "./perform-device-enrollment";

function createContext(synced = false) {
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
  const authorizedSnapshot: VaultSnapshot = {
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
  const response: DeviceEnrollmentResponse = {
    version: 1,
    requestId: values.requestId,
    vaultId: values.vaultId,
    vaultTrustAnchor: values.vaultTrustAnchor,
    snapshot: authorizedSnapshot,
  };
  const pending: PendingDeviceEnrollment = {
    requestId: values.requestId,
    vaultId: values.vaultId,
    deviceId: values.pendingDeviceId,
    algorithmSuiteId: ports.crypto.algorithmSuite.id,
    masterPasswordSalt: values.masterPasswordSalt,
    localKeysProtectionSalt: values.localKeysProtectionSalt,
    protectedPrivateState: values.protectedPendingDeviceEnrollment,
  };
  ports.saved.pendingDeviceEnrollment = pending;
  vi.mocked(ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
    ...values.decryptedVault,
    entries: [singlePasswordEntry],
    ...(synced ? { syncTarget: values.syncTarget } : {}),
  });
  vi.mocked(
    ports.syncProvider.getLatestVaultSnapshotDescriptor,
  ).mockResolvedValue(
    toVaultSnapshotDescriptor(values.vaultId, authorizedSnapshot),
  );
  const useCase = new PerformDeviceEnrollmentUseCase(
    ports.clock,
    ports.crypto,
    ports.bip39,
    ports.syncProvider,
    ports.sessionServices.unlockedVaultSession,
    ports.vaultDisplayName,
    ports.vaultLocalRepository,
  );

  return { values, ports, response, useCase };
}

describe("PerformDeviceEnrollmentUseCase", () => {
  it("rejects a weak password before reading pending enrollment", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: "Password1234567!" as RawMasterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBeInstanceOf(InvalidNewMasterPasswordError);

    expect(
      ctx.ports.vaultLocalRepository.getPendingDeviceEnrollment,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
  });

  it("accepts a strong password at the minimum length", async () => {
    const ctx = createContext();
    const masterPassword = "vN7#qL2!xP9@rT4$" as RawMasterPassword;

    await ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword,
      deviceName: "New laptop",
    });

    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenNthCalledWith(
      1,
      masterPassword,
      ctx.values.masterPasswordSalt,
    );
  });

  it("uploads the signed enrollment even when local storage replaces it after save", async () => {
    const ctx = createContext(true);
    const getPersistedSnapshot = replaceVaultSnapshotAfterNextInitializedSave(
      ctx.ports,
      ctx.response.snapshot,
    );

    await ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      syncConfig: ctx.values.syncConfigInput,
    });

    const uploadedSnapshot = vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mock.calls[0]?.[1];
    expect(uploadedSnapshot).toBe(getPersistedSnapshot());
    expect(uploadedSnapshot).not.toBe(ctx.ports.saved.vaultSnapshot);
    expect(ctx.ports.saved.vaultSnapshot).toBe(ctx.response.snapshot);
  });

  it("uses retained target keys and removes pending state only after completion", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
    });

    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).toHaveBeenCalledWith(
      ctx.values.pendingDeviceVaultKeyEnvelope,
      ctx.values.pendingDevicePrivateVaultKey,
      {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        vaultKeyGeneration: 1,
        algorithmSuiteId: "spm-v1",
      },
    );
    expect(ctx.ports.saved.deviceAccessMaterial).toMatchObject({
      deviceId: ctx.values.pendingDeviceId,
      devicePublicSignKey: ctx.values.pendingDevicePublicSignKey,
      devicePublicVaultKey: ctx.values.pendingDevicePublicVaultKey,
    });
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeUndefined();
    expect(result.vault.deviceProfiles).toContainEqual(
      expect.objectContaining({ id: ctx.values.pendingDeviceId }),
    );
    expect(result.vault.entries).toContainEqual({
      id: singlePasswordEntry.id,
      login: singlePasswordEntry.login,
      tags: singlePasswordEntry.tags,
      sanitizedUrl: singlePasswordEntry.sanitizedUrl,
    });
    expect(result.vault.entries[0]).not.toHaveProperty("password");
    expect(result.vault).not.toHaveProperty("syncTarget");
    expect(result.snapshotVersionVector).toEqual({
      [ctx.values.deviceId]: 2,
      [ctx.values.pendingDeviceId]: 1,
    });
    expect(result.revisionTimestamp).toBe(ctx.values.timestamp);
    expect(result.syncUpload).toBe("complete");

    result.snapshotVersionVector[ctx.values.pendingDeviceId] = 99;

    expect(
      ctx.ports.saved.unlockedVaultSession?.sourceSnapshotVersionVector,
    ).toEqual({
      [ctx.values.deviceId]: 2,
      [ctx.values.pendingDeviceId]: 1,
    });
  });

  it("encrypts manually supplied sync credentials only in local storage", async () => {
    const ctx = createContext(true);

    const result = await ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      syncConfig: ctx.values.syncConfigInput,
    });

    expect(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).toHaveBeenCalledWith(
      { currentCredentials: ctx.values.syncCredentials },
      ctx.values.pendingDeviceLocalProtectionKey,
      {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.pendingDeviceId,
        provider: ctx.values.syncTarget.provider,
        target: ctx.values.syncTarget,
      },
    );
    expect(ctx.ports.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
    expect(result).not.toHaveProperty("credentials");
    expect(result).not.toHaveProperty("syncConfig");
    expect(result.vault).not.toHaveProperty("syncTarget");
  });

  it("rejects enrollment while remote sync removal is pending", async () => {
    const ctx = createContext(true);
    const rollbackSnapshot = createUnlockVaultTestContext().vaultSnapshot;

    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.values.decryptedVault,
      syncTarget: ctx.values.syncTarget,
      syncRemovalPending: {
        expectedRemoteSnapshotDescriptor: null,
        rollbackSnapshot,
      },
    });

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(SyncRemovalPendingError);

    expect(ctx.ports.syncProvider.setup).not.toHaveBeenCalled();
    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("retains pending state when a target key pair does not match", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.verifyDeviceVaultKeyPair).mockResolvedValue(
      false,
    );

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBeInstanceOf(PendingDeviceEnrollmentMismatchError);

    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
  });

  it("rejects a self-consistent response rooted in another trust anchor", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: {
          ...ctx.response,
          vaultTrustAnchor: {
            ...ctx.response.vaultTrustAnchor,
            genesisCertificateDigest: "substituted-genesis-digest",
          },
        },
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentIntegrityError);

    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
  });

  it("removes initialized local state when session activation fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(new Error("session activation failed"));

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toThrow("session activation failed");

    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("preserves the activation error when local cleanup also fails", async () => {
    const ctx = createContext();
    const activationError = new Error("session activation failed");
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(activationError);
    vi.mocked(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).mockRejectedValueOnce(new Error("local cleanup failed"));

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBe(activationError);

    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBeInstanceOf(LocalVaultAlreadyInitializedError);

    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("preserves newer local state after enrollment upload is rejected", async () => {
    const ctx = createContext(true);
    let rejectUpload: (error: Error) => void = () => undefined;
    let uploadStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      uploadStarted = resolve;
    });
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(
      async () =>
        new Promise<never>((_resolve, reject) => {
          rejectUpload = reject;
          uploadStarted();
        }),
    );

    const execution = ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      syncConfig: ctx.values.syncConfigInput,
    });

    await started;
    const activeSession = ctx.ports.saved.unlockedVaultSession;

    if (activeSession === undefined) {
      throw new Error("expected enrollment session to be active");
    }

    await ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot(
      activeSession.sessionId,
      activeSession.unlockedVault,
      { [ctx.values.deviceId]: 3 },
    );
    rejectUpload(new RemoteVaultSnapshotChangedError(ctx.values.vaultId));

    await expect(execution).resolves.toMatchObject({
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      syncUpload: "complete",
    });
    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.unlockedVaultSession).toMatchObject({
      sourceSnapshotVersionVector: { [ctx.values.deviceId]: 3 },
    });
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfSnapshotMatches,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeUndefined();
  });

  it("does not remove a locally replaced enrollment snapshot", async () => {
    const ctx = createContext(true);
    let rejectUpload: (error: Error) => void = () => undefined;
    let uploadStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      uploadStarted = resolve;
    });
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(
      async () =>
        new Promise<never>((_resolve, reject) => {
          rejectUpload = reject;
          uploadStarted();
        }),
    );

    const execution = ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      syncConfig: ctx.values.syncConfigInput,
    });

    await started;
    ctx.ports.saved.vaultSnapshotDigest = "newer-local-snapshot-digest";
    rejectUpload(new RemoteVaultSnapshotChangedError(ctx.values.vaultId));

    await expect(execution).rejects.toBeInstanceOf(
      DeviceEnrollmentRollbackIncompleteError,
    );
    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.vaultSnapshotDigest).toBe(
      "newer-local-snapshot-digest",
    );
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfSnapshotMatches,
    ).toHaveBeenCalledOnce();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("returns recoverable local enrollment after an indeterminate upload failure", async () => {
    const ctx = createContext(true);
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValueOnce(
      new Error("upload failed"),
    );

    const result = await ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      syncConfig: ctx.values.syncConfigInput,
    });

    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeUndefined();
    expect(result.recoveryMnemonicKey).toBe(ctx.values.recoveryMnemonicKey);
    expect(result.syncUpload).toBe("pending");
  });

  it("keeps local state when session invalidation fails after a rejected upload", async () => {
    const ctx = createContext(true);
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValueOnce(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
    );
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(new Error("session removal failed"));

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentRollbackIncompleteError);

    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("reports incomplete rollback when rejected-upload local cleanup fails", async () => {
    const ctx = createContext(true);
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValueOnce(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
    );
    vi.mocked(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfSnapshotMatches,
    ).mockRejectedValueOnce(new Error("local cleanup failed"));

    const execution = ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      syncConfig: ctx.values.syncConfigInput,
    });

    await expect(execution).rejects.toMatchObject({
      name: "DeviceEnrollmentRollbackIncompleteError",
      cause: expect.objectContaining({
        name: "DeviceEnrollmentRemoteSnapshotChangedError",
      }),
    });
    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("rolls back local state after a definitive compare-and-set rejection", async () => {
    const ctx = createContext(true);
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValueOnce(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
    );

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentRemoteSnapshotChangedError);

    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("reports success when completed pending-state cleanup fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.vaultLocalRepository.removePendingDeviceEnrollment,
    ).mockRejectedValueOnce(new Error("pending cleanup failed"));

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).resolves.toMatchObject({
      deviceId: ctx.values.pendingDeviceId,
    });

    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("rejects a retained enrollment response without replacing an initialized vault", async () => {
    const ctx = createContext();
    const descriptor = {
      vaultId: ctx.values.vaultId,
      displayName: "Existing vault",
      createdAt: ctx.values.timestamp,
    };
    const existingAccessMaterial = {
      vaultId: ctx.values.vaultId,
      deviceId: ctx.values.deviceId,
      algorithmSuiteId: ctx.ports.crypto.algorithmSuite.id,
      masterPasswordSalt: ctx.values.masterPasswordSalt,
      localKeysProtectionSalt: ctx.values.localKeysProtectionSalt,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      devicePublicVaultKey: ctx.values.devicePublicVaultKey,
      protectedLocalKeys: ctx.values.protectedLocalKeys,
    };
    const existingSnapshot = ctx.response.snapshot;
    ctx.ports.saved.localVaultDescriptor = descriptor;
    ctx.ports.saved.deviceAccessMaterial = existingAccessMaterial;
    ctx.ports.saved.vaultSnapshot = existingSnapshot;

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBeInstanceOf(LocalVaultAlreadyInitializedError);

    expect(ctx.ports.saved.localVaultDescriptor).toBe(descriptor);
    expect(ctx.ports.saved.deviceAccessMaterial).toBe(existingAccessMaterial);
    expect(ctx.ports.saved.vaultSnapshot).toBe(existingSnapshot);
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });
});
