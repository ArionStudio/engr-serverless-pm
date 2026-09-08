import { describe, expect, it, vi } from "vitest";
import {
  createCoreTestPorts,
  captureVaultSnapshotFromNextInitializedSave,
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
  DeviceEnrollmentSyncCredentialsRequiredError,
  DeviceEnrollmentRemoteSnapshotChangedError,
  PendingDeviceEnrollmentMismatchError,
} from "../../errors/device-enrollment.errors";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
import { RecoveryMnemonicEncodingError } from "../../errors/recovery.errors";
import { DeviceAccessMaterialChangedError } from "../../errors/vault-device.errors";
import {
  RemoteVaultSnapshotChangedError,
  SyncNotConfiguredError,
  SyncRemovalPendingError,
} from "../../errors/sync.errors";
import { LocalVaultAlreadyInitializedError } from "../../errors/vault-lifecycle.errors";
import { InvalidVaultLockDelayError } from "../../errors/vault-session.errors";
import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ClipboardPort } from "../../ports/clipboard/clipboard.port";
import type { SyncUploadOutcome } from "../../ports/sync/sync-provider.port";
import { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";
import { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { VaultLifecycleCleanupService } from "../../services/session/vault-lifecycle-cleanup.service";
import { DeviceEnrollmentApprovalService } from "../../services/trust/device-enrollment-approval.service";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import { ChangeMasterPasswordUseCase } from "../vault-lifecycle/change-master-password";
import { LockVaultUseCase } from "../vault-lifecycle/lock-vault";
import { ReadDeviceEnrollmentApprovalUseCase } from "./read-device-enrollment-approval";
import { PerformDeviceEnrollmentUseCase } from "./perform-device-enrollment";

function createContext(synced = true) {
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
  const clipboard: ClipboardPort = {
    readText: vi.fn(async () => singlePasswordEntry.password),
    writeText: vi.fn(async () => undefined),
  };
  const clipboardClearTasks: ClipboardClearTaskRepositoryPort = {
    save: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
  };
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    ports.clock,
    ports.clipboardSecretHash,
  );
  const clipboardOperations = ports.clipboardOperations;
  const lifecycleCleanup = new VaultLifecycleCleanupService(
    clipboardClear,
    clipboardClearTasks,
    clipboardOperations,
    ports.scheduledTasks,
    ports.vaultLockTasks,
    ports.sessionServices.unlockedVaultSession,
  );
  const enrollmentApproval = new DeviceEnrollmentApprovalService(
    ports.crypto,
    ports.vaultLocalRepository,
    new VaultTrustService(ports.crypto),
  );
  const useCase = new PerformDeviceEnrollmentUseCase(
    ports.clock,
    ports.crypto,
    ports.ids,
    ports.bip39,
    ports.syncProvider,
    ports.sessionServices.unlockedVaultSession,
    ports.vaultDisplayName,
    ports.vaultLocalRepository,
    lifecycleCleanup,
    ports.scheduledTasks,
    ports.vaultLockTasks,
    clipboardOperations,
    enrollmentApproval,
  );

  vi.mocked(ports.ids.generateId).mockReset();
  vi.mocked(ports.ids.generateId)
    .mockResolvedValueOnce(values.localAccessGenerationId)
    .mockResolvedValueOnce(values.vaultLockActionId)
    .mockResolvedValue(values.sessionId);

  return {
    values,
    ports,
    response,
    clipboard,
    clipboardClear,
    clipboardClearTasks,
    clipboardOperations,
    lifecycleCleanup,
    enrollmentApproval,
    useCase,
  };
}

async function expectEnrollmentOwnedBuffersWiped(
  ctx: ReturnType<typeof createContext>,
  stage: "pendingProtection" | "recoveryEncoding" | "all" = "all",
): Promise<void> {
  const pendingRootKey = await vi.mocked(ctx.ports.crypto.deriveLocalRootKey)
    .mock.results[0]!.value;
  const pendingProtectionKey = await vi.mocked(
    ctx.ports.crypto.deriveDeviceEnrollmentPrivateStateProtectionKey,
  ).mock.results[0]!.value;

  if (stage === "pendingProtection") {
    for (const buffer of [pendingRootKey, pendingProtectionKey]) {
      expect(Array.from(new Uint8Array(buffer))).toEqual([0]);
    }

    return;
  }

  const recoveryKey = await vi.mocked(ctx.ports.crypto.generateRecoveryKey).mock
    .results[0]!.value;
  const privateState = await vi.mocked(
    ctx.ports.crypto.unwrapDeviceEnrollmentPrivateState,
  ).mock.results[0]!.value;
  const vaultMasterKey = await vi.mocked(
    ctx.ports.crypto.openDeviceVaultKeyEnvelope,
  ).mock.results[0]!.value;

  const throughRecoveryEncoding = [
    pendingRootKey,
    pendingProtectionKey,
    recoveryKey,
    privateState.devicePrivateSignKey,
    privateState.devicePrivateVaultKey,
    privateState.deviceLocalProtectionKey,
    vaultMasterKey,
  ];

  if (stage === "recoveryEncoding") {
    for (const buffer of throughRecoveryEncoding) {
      expect(Array.from(new Uint8Array(buffer))).toEqual([0]);
    }

    return;
  }

  const nextRootKey = await vi.mocked(ctx.ports.crypto.deriveLocalRootKey).mock
    .results[1]!.value;
  const localProtectionKey = await vi.mocked(
    ctx.ports.crypto.deriveLocalKeysProtectionKey,
  ).mock.results[0]!.value;
  const recoveryProtectionKey = await vi.mocked(
    ctx.ports.crypto.deriveRecoveryLocalKeysProtectionKey,
  ).mock.results[0]!.value;

  for (const buffer of [
    ...throughRecoveryEncoding,
    nextRootKey,
    localProtectionKey,
    recoveryProtectionKey,
  ]) {
    expect(Array.from(new Uint8Array(buffer))).toEqual([0]);
  }
}

describe("PerformDeviceEnrollmentUseCase", () => {
  it("reads only the verified sync target without enrolling and wipes the decrypted secrets", async () => {
    const { ports, values, response, enrollmentApproval } = createContext();
    const read = new ReadDeviceEnrollmentApprovalUseCase(enrollmentApproval);
    const target = structuredClone(values.syncAccess.target);
    const result = await read.execute({
      enrollmentResponse: response,
      masterPassword: values.masterPassword,
    });
    expect(result).toEqual({
      vaultId: response.vaultId,
      requestId: response.requestId,
      target,
    });
    expect(
      ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
    expect(ports.syncProvider.setup).not.toHaveBeenCalled();
    const privateState = await vi.mocked(
      ports.crypto.unwrapDeviceEnrollmentPrivateState,
    ).mock.results[0].value;
    for (const buffer of [
      privateState.devicePrivateSignKey,
      privateState.devicePrivateVaultKey,
      privateState.deviceLocalProtectionKey,
    ])
      expect(new Uint8Array(buffer).every((byte) => byte === 0)).toBe(true);
  });

  it("does not expose a storage target when the approval's trust anchor differs from the request", async () => {
    const { ports, values, response, enrollmentApproval } = createContext();
    const read = new ReadDeviceEnrollmentApprovalUseCase(enrollmentApproval);
    await expect(
      read.execute({
        enrollmentResponse: {
          ...response,
          vaultTrustAnchor: {
            ...response.vaultTrustAnchor,
            genesisCertificateDigest: "untrusted",
          },
        },
        masterPassword: values.masterPassword,
      }),
    ).rejects.toThrow(DeviceEnrollmentIntegrityError);
    expect(ports.crypto.decryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(ports.syncProvider.setup).not.toHaveBeenCalled();
  });

  it("requires the new device's S3 credentials before local initialization", async () => {
    const ctx = createContext();
    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New device",
        lockAfterMs: 600_000,
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentSyncCredentialsRequiredError);
    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("rejects an approval for a vault without sync before initializing this device", async () => {
    const ctx = createContext(false);
    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New device",
        lockAfterMs: 600_000,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(SyncNotConfiguredError);
    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    expect(ctx.ports.syncProvider.setup).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a password below maximum strength before reading pending enrollment", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: "correcthorsebatterystaple" as RawMasterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(InvalidNewMasterPasswordError);

    expect(
      ctx.ports.vaultLocalRepository.getPendingDeviceEnrollment,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
  });

  it("stops before crypto, persistence, and activation when pending enrollment decoding fails", async () => {
    const ctx = createContext();
    const decodeError = new Error("pending enrollment artifact is malformed");
    vi.mocked(
      ctx.ports.vaultLocalRepository.getPendingDeviceEnrollment,
    ).mockRejectedValueOnce(decodeError);

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toBe(decodeError);

    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.unwrapDeviceEnrollmentPrivateState,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.verifyDeviceEnrollmentRequestSignature,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.signVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.vaultLockTasks.save).not.toHaveBeenCalled();
    expect(ctx.ports.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
  });

  it("stops after authenticated private-state decoding fails", async () => {
    const ctx = createContext();
    const decodeError = new Error(
      "device enrollment private state is malformed",
    );
    vi.mocked(
      ctx.ports.crypto.unwrapDeviceEnrollmentPrivateState,
    ).mockRejectedValueOnce(decodeError);

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toBe(decodeError);

    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenCalledOnce();
    expect(
      ctx.ports.crypto.deriveLocalKeysProtectionKey,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.deriveRecoveryLocalKeysProtectionKey,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.verifyDeviceEnrollmentRequestSignature,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.verifyDeviceSignKeyPair).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.signVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.signLocalVaultTrustCheckpoint,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.vaultLockTasks.save).not.toHaveBeenCalled();
    expect(ctx.ports.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    await expectEnrollmentOwnedBuffersWiped(ctx, "pendingProtection");
  });

  it("preserves mnemonic encoding failures, leaves enrollment retryable, and wipes owned secrets", async () => {
    const ctx = createContext();
    const encodingError = new RecoveryMnemonicEncodingError();
    vi.mocked(ctx.ports.bip39.recoveryKeyToMnemonic).mockRejectedValueOnce(
      encodingError,
    );

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toBe(encodingError);

    expect(ctx.ports.crypto.generateMasterPasswordSalt).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.removePendingDeviceEnrollment,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
    await expectEnrollmentOwnedBuffersWiped(ctx, "recoveryEncoding");
  });

  it("keeps request identity and private-key matching in the core semantic owner", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.unwrapDeviceEnrollmentPrivateState,
    ).mockResolvedValueOnce({
      ...ctx.values.pendingDeviceEnrollmentPrivateState,
      request: {
        ...ctx.values.enrollmentRequest,
        payload: {
          ...ctx.values.enrollmentRequestPayload,
          requestId: "another-request-id",
        },
      },
    });

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(PendingDeviceEnrollmentMismatchError);

    expect(
      ctx.ports.crypto.verifyDeviceEnrollmentRequestSignature,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.verifyDeviceSignKeyPair).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.signVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
  });

  it("accepts a maximum-strength password", async () => {
    const ctx = createContext();
    const masterPassword = "vN7#qL2!xP9@rT4$zK6&" as RawMasterPassword;

    await ctx.useCase.execute({
      syncConfig: ctx.values.syncConfigInput,
      enrollmentResponse: ctx.response,
      masterPassword,
      deviceName: "New laptop",
      lockAfterMs: 60_000,
    });

    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenNthCalledWith(
      1,
      masterPassword,
      ctx.values.masterPasswordSalt,
    );
  });

  it("rejects an invalid freshly generated access generation", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.ids.generateId).mockReset().mockResolvedValueOnce("");

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialChangedError);

    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("uploads the exact signed enrollment persisted by the local save", async () => {
    const ctx = createContext(true);
    const getPersistedSnapshot = captureVaultSnapshotFromNextInitializedSave(
      ctx.ports,
    );

    await ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      syncConfig: ctx.values.syncConfigInput,
      lockAfterMs: 60_000,
    });

    const uploadedSnapshot = vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mock.calls[0]?.[1];
    expect(uploadedSnapshot).toBe(getPersistedSnapshot());
  });

  it("uses retained target keys and removes pending state only after completion", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      syncConfig: ctx.values.syncConfigInput,
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      lockAfterMs: 60_000,
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
      localAccessGenerationId: ctx.values.localAccessGenerationId,
      deviceId: ctx.values.pendingDeviceId,
      devicePublicSignKey: ctx.values.pendingDevicePublicSignKey,
      devicePublicVaultKey: ctx.values.pendingDevicePublicVaultKey,
    });
    expect(ctx.ports.saved.deviceAccessRecoveryBackup).toMatchObject({
      localAccessGenerationId: ctx.values.localAccessGenerationId,
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
      folderId: "uncategorized",
      hasPassword: true,
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
    expect(ctx.ports.vaultLockTasks.save).toHaveBeenCalledWith({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    expect(ctx.ports.scheduledTasks.scheduleTask).toHaveBeenCalledWith({
      task: {
        name: "lockVault",
        actionId: ctx.values.vaultLockActionId,
      },
      runAt: ctx.values.timestamp + 60_000,
    });
  });

  it("rejects an invalid lock delay before reading pending enrollment", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 1 as never,
      }),
    ).rejects.toBeInstanceOf(InvalidVaultLockDelayError);

    expect(
      ctx.ports.vaultLocalRepository.getPendingDeviceEnrollment,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
  });

  it("rolls back local enrollment when lock scheduling fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.scheduledTasks.scheduleTask).mockRejectedValueOnce(
      new Error("schedule failed"),
    );

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toThrow("schedule failed");

    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    await expectEnrollmentOwnedBuffersWiped(ctx);
  });

  it("encrypts manually supplied sync credentials only in local storage", async () => {
    const ctx = createContext(true);

    const result = await ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      lockAfterMs: 60_000,
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
    await expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState(
        ctx.ports.saved.deviceSyncCredentialState!,
        ctx.values.pendingDeviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.pendingDeviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      ),
    ).resolves.toEqual({ currentCredentials: ctx.values.syncCredentials });
    expect(result.displayName).toBe(
      ctx.ports.saved.localVaultDescriptor?.displayName,
    );
    expect(result.displayName).toBe(ctx.values.vaultDisplayName);
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
        expectedRemoteSnapshotIdentity: null,
        rollbackSnapshot,
      },
    });

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
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
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(PendingDeviceEnrollmentMismatchError);

    expect(ctx.ports.crypto.verifyDeviceVaultKeyPair).toHaveBeenCalledOnce();
    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.deriveLocalKeysProtectionKey,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.signVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
  });

  it("rejects a self-consistent response rooted in another trust anchor", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: {
          ...ctx.response,
          vaultTrustAnchor: {
            ...ctx.response.vaultTrustAnchor,
            genesisCertificateDigest: "substituted-genesis-digest",
          },
        },
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
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
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toThrow("session activation failed");

    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        vaultId: ctx.values.vaultId,
        expectedDescriptor: expect.any(Object),
        expectedDeviceAccessMaterial: expect.any(Object),
        expectedDeviceAccessRecoveryBackup: expect.any(Object),
        expectedSnapshotDigest: ctx.values.vaultSnapshotDigest,
        expectedCheckpoint: expect.any(Object),
        expectedSyncCredentialState:
          ctx.values.encryptedDeviceSyncCredentialState,
      }),
    );
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    expect(ctx.ports.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledTimes(1);
    await expectEnrollmentOwnedBuffersWiped(ctx);
    const payloadKey = await vi.mocked(
      ctx.ports.crypto.generateUnlockedVaultSessionPayloadKey,
    ).mock.results[0]!.value;
    expect(Array.from(new Uint8Array(payloadKey))).toEqual([0]);
  });

  it("preserves the activation error when local cleanup also fails", async () => {
    const ctx = createContext();
    const activationError = new Error("session activation failed");
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(activationError);
    vi.mocked(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch,
    ).mockRejectedValueOnce(new Error("local cleanup failed"));

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toBe(activationError);

    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(LocalVaultAlreadyInitializedError);

    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("preserves newer local state without reporting a rejected upload as complete", async () => {
    const ctx = createContext(true);
    let resolveUpload: (outcome: SyncUploadOutcome) => void = () => undefined;
    let uploadStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      uploadStarted = resolve;
    });
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(
      async () =>
        new Promise<SyncUploadOutcome>((resolve) => {
          resolveUpload = resolve;
          uploadStarted();
        }),
    );

    const execution = ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      lockAfterMs: 60_000,
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
    resolveUpload({
      status: "definitely_not_committed",
      reason: "remote_snapshot_changed",
    });

    await expect(execution).rejects.toBeInstanceOf(
      DeviceEnrollmentRollbackIncompleteError,
    );
    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.unlockedVaultSession).toMatchObject({
      sourceSnapshotVersionVector: { [ctx.values.deviceId]: 3 },
    });
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("preserves advanced session keys when rejected-upload rollback cannot read material", async () => {
    const ctx = createContext(true);
    let resolveUpload: (outcome: SyncUploadOutcome) => void = () => undefined;
    let uploadStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      uploadStarted = resolve;
    });
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(
      async () =>
        new Promise<SyncUploadOutcome>((resolve) => {
          resolveUpload = resolve;
          uploadStarted();
        }),
    );

    const execution = ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      lockAfterMs: 60_000,
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
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(new Error("material read failed"));
    resolveUpload({
      status: "definitely_not_committed",
      reason: "remote_snapshot_changed",
    });

    await expect(execution).rejects.toBeInstanceOf(
      DeviceEnrollmentRollbackIncompleteError,
    );
    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    for (const secret of [
      activeSession.unlockedVault.vaultMasterKey,
      activeSession.unlockedVault.devicePrivateSignKey,
      activeSession.unlockedVault.devicePrivateVaultKey,
      activeSession.unlockedVault.deviceLocalProtectionKey,
    ]) {
      expect(Array.from(new Uint8Array(secret))).not.toEqual([0]);
    }
  });

  it("preserves shared keys owned by a replacement same-vault session", async () => {
    const ctx = createContext(true);
    let resolveUpload: (outcome: SyncUploadOutcome) => void = () => undefined;
    let uploadStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      uploadStarted = resolve;
    });
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(
      async () =>
        new Promise<SyncUploadOutcome>((resolve) => {
          resolveUpload = resolve;
          uploadStarted();
        }),
    );

    const execution = ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      lockAfterMs: 60_000,
      syncConfig: ctx.values.syncConfigInput,
    });

    await started;
    const activeSession = ctx.ports.saved.unlockedVaultSession;

    if (activeSession === undefined) {
      throw new Error("expected enrollment session to be active");
    }

    vi.mocked(ctx.ports.ids.generateId).mockResolvedValueOnce(
      "replacement-session-id",
    );
    const activationGeneration =
      await ctx.ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        ctx.values.vaultId,
      );
    await ctx.ports.sessionServices.unlockedVaultSession.activate(
      activationGeneration,
      activeSession.unlockedVault,
      activeSession.sourceSnapshotVersionVector,
    );
    resolveUpload({
      status: "definitely_not_committed",
      reason: "remote_snapshot_changed",
    });

    await expect(execution).rejects.toBeInstanceOf(
      DeviceEnrollmentRollbackIncompleteError,
    );
    expect(ctx.ports.saved.unlockedVaultSession?.sessionId).toBe(
      "replacement-session-id",
    );
    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    for (const secret of [
      activeSession.unlockedVault.vaultMasterKey,
      activeSession.unlockedVault.devicePrivateSignKey,
      activeSession.unlockedVault.devicePrivateVaultKey,
      activeSession.unlockedVault.deviceLocalProtectionKey,
    ]) {
      expect(Array.from(new Uint8Array(secret))).not.toEqual([0]);
    }
  });

  it("does not report rejected enrollment upload as complete after concurrent lock", async () => {
    const ctx = createContext(true);
    let resolveUpload: (outcome: SyncUploadOutcome) => void = () => undefined;
    let uploadStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      uploadStarted = resolve;
    });
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(
      async () =>
        new Promise<SyncUploadOutcome>((resolve) => {
          resolveUpload = resolve;
          uploadStarted();
        }),
    );
    const lockVault = new LockVaultUseCase(ctx.lifecycleCleanup);

    const execution = ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      lockAfterMs: 60_000,
      syncConfig: ctx.values.syncConfigInput,
    });

    await started;
    await lockVault.execute();
    resolveUpload({
      status: "definitely_not_committed",
      reason: "remote_snapshot_changed",
    });

    await expect(execution).rejects.toBeInstanceOf(
      DeviceEnrollmentRollbackIncompleteError,
    );
    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("does not remove a locally replaced enrollment snapshot", async () => {
    const ctx = createContext(true);
    let resolveUpload: (outcome: SyncUploadOutcome) => void = () => undefined;
    let uploadStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      uploadStarted = resolve;
    });
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(
      async () =>
        new Promise<SyncUploadOutcome>((resolve) => {
          resolveUpload = resolve;
          uploadStarted();
        }),
    );

    const execution = ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      lockAfterMs: 60_000,
      syncConfig: ctx.values.syncConfigInput,
    });

    await started;
    ctx.ports.saved.vaultSnapshotDigest = "newer-local-snapshot-digest";
    resolveUpload({
      status: "definitely_not_committed",
      reason: "remote_snapshot_changed",
    });

    await expect(execution).rejects.toBeInstanceOf(
      DeviceEnrollmentRollbackIncompleteError,
    );
    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.vaultSnapshotDigest).toBe(
      "newer-local-snapshot-digest",
    );
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch,
    ).toHaveBeenCalledOnce();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("preserves access records changed while a rejected enrollment upload is pending", async () => {
    const ctx = createContext(true);
    let resolveUpload: (outcome: SyncUploadOutcome) => void = () => undefined;
    let uploadStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      uploadStarted = resolve;
    });
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(
      async () =>
        new Promise<SyncUploadOutcome>((resolve) => {
          resolveUpload = resolve;
          uploadStarted();
        }),
    );
    const otherContextSession = new UnlockedVaultSessionService(
      ctx.ports.unlockedVaultSessionMaterialRepository,
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository,
      ctx.ports.crypto,
      ctx.ports.ids,
      ctx.ports.clipboardOperations,
    );
    const changeMasterPassword = new ChangeMasterPasswordUseCase(
      ctx.ports.crypto,
      ctx.ports.vaultLocalRepository,
      otherContextSession,
      ctx.ports.ids,
    );

    const execution = ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      lockAfterMs: 60_000,
      syncConfig: ctx.values.syncConfigInput,
    });

    await started;
    await changeMasterPassword.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });
    const changedMaterial = ctx.ports.saved.deviceAccessMaterial;
    const changedBackup = ctx.ports.saved.deviceAccessRecoveryBackup;
    expect(changedMaterial?.revision).toBe(2);
    expect(changedBackup?.revision).toBe(2);

    resolveUpload({
      status: "definitely_not_committed",
      reason: "remote_snapshot_changed",
    });

    await expect(execution).rejects.toBeInstanceOf(
      DeviceEnrollmentRollbackIncompleteError,
    );
    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.deviceAccessMaterial).toBe(changedMaterial);
    expect(ctx.ports.saved.deviceAccessRecoveryBackup).toBe(changedBackup);
    expect(ctx.ports.saved.vaultSnapshot).toBeDefined();
    expect(ctx.ports.saved.localVaultTrustCheckpoint).toBeDefined();
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch,
    ).toHaveBeenCalledOnce();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("does not remove enrollment state after another reconciler replaces the staged upload intent", async () => {
    const ctx = createContext(true);
    vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mockImplementationOnce(async () => {
      const snapshot = ctx.ports.saved.vaultSnapshot;
      const snapshotDigest = ctx.ports.saved.vaultSnapshotDigest;
      const checkpoint = ctx.ports.saved.localVaultTrustCheckpoint;
      const stagedCredentialState = ctx.ports.saved.deviceSyncCredentialState;

      if (
        snapshot === undefined ||
        snapshotDigest === undefined ||
        checkpoint === undefined ||
        stagedCredentialState === undefined
      ) {
        throw new Error("Expected a staged enrollment upload intent.");
      }

      await ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
        expectedSnapshotDigest: snapshotDigest,
        expectedCheckpoint: checkpoint,
        expectedSyncCredentialState: stagedCredentialState,
        snapshot,
        checkpoint,
        syncCredentialState: ctx.values.encryptedDeviceSyncCredentialState,
      });

      return {
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      };
    });

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentRollbackIncompleteError);

    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.vaultSnapshot).toBeDefined();
    expect(ctx.ports.saved.deviceSyncCredentialState).toEqual(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch,
    ).toHaveBeenCalledOnce();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it.each(["locked", "replaced"] as const)(
    "withholds recovery words if the enrolling session is %s during upload",
    async (state) => {
      const ctx = createContext(true);
      vi.mocked(
        ctx.ports.syncProvider.uploadVaultSnapshot,
      ).mockImplementationOnce(async () => {
        if (state === "locked") {
          await ctx.ports.sessionServices.unlockedVaultSession.remove();
        } else {
          const session =
            await ctx.ports.sessionServices.unlockedVaultSession.get();
          if (session === null)
            throw new Error("Expected active enrollment session");
          // A valid replacement session for this vault still cannot receive the original operation's words.
          ctx.ports.saved.unlockedVaultSession = {
            ...session,
            sessionId: "replacement-session",
          };
        }
        return { status: "outcome_unknown" };
      });
      await expect(
        ctx.useCase.execute({
          enrollmentResponse: ctx.response,
          masterPassword: ctx.values.masterPassword,
          deviceName: "New laptop",
          lockAfterMs: 60_000,
          syncConfig: ctx.values.syncConfigInput,
        }),
      ).rejects.toMatchObject({
        name:
          state === "locked"
            ? "VaultMustBeUnlockedError"
            : "UnlockedVaultSessionExpiredError",
      });
      expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
      expect(ctx.ports.saved.vaultSnapshot).toBeDefined();
      expect(ctx.ports.saved.deviceSyncCredentialState).toBeDefined();
      expect(
        ctx.ports.vaultLocalRepository.removePersistedLocalVault,
      ).not.toHaveBeenCalled();
    },
  );

  it("returns recoverable local enrollment after an outcome-unknown upload", async () => {
    const ctx = createContext(true);
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "outcome_unknown",
      },
    );

    const result = await ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      lockAfterMs: 60_000,
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
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      },
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
        lockAfterMs: 60_000,
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
    vi.mocked(
      ctx.ports.syncProvider.prepareVaultSnapshotUpload,
    ).mockRejectedValueOnce(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
    );
    vi.mocked(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch,
    ).mockRejectedValueOnce(new Error("local cleanup failed"));

    const execution = ctx.useCase.execute({
      enrollmentResponse: ctx.response,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
      lockAfterMs: 60_000,
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

  it("preserves the active session and local enrollment when rollback coordination is unavailable", async () => {
    const ctx = createContext(true);
    const coordinationError = new Error("clipboard coordination unavailable");
    vi.mocked(
      ctx.ports.syncProvider.prepareVaultSnapshotUpload,
    ).mockRejectedValueOnce(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
    );
    const runExclusive = ctx.clipboardOperations.runExclusive.bind(
      ctx.clipboardOperations,
    );
    vi.spyOn(ctx.clipboardOperations, "runExclusive")
      .mockImplementationOnce(runExclusive)
      .mockImplementationOnce(runExclusive)
      .mockImplementationOnce(runExclusive)
      .mockRejectedValueOnce(coordinationError);

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toMatchObject({
      name: "DeviceEnrollmentRollbackIncompleteError",
      cause: expect.objectContaining({
        name: "DeviceEnrollmentRemoteSnapshotChangedError",
      }),
    });

    expect(ctx.clipboardClearTasks.get).not.toHaveBeenCalled();
    expect(ctx.ports.vaultLockTasks.get).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
  });

  it("rolls back local state after a definitive compare-and-set rejection", async () => {
    const ctx = createContext(true);
    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValue({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValue({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      },
    );

    await expect(
      ctx.useCase.execute({
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentRemoteSnapshotChangedError);

    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
    expect(ctx.ports.saved.pendingDeviceEnrollment).toBeDefined();
    expect(ctx.clipboard.writeText).toHaveBeenCalledWith("");
    expect(ctx.ports.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    expect(ctx.ports.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledWith(ctx.values.vaultLockActionId);

    const privateState = await vi.mocked(
      ctx.ports.crypto.unwrapDeviceEnrollmentPrivateState,
    ).mock.results[0]!.value;
    const vaultMasterKey = await vi.mocked(
      ctx.ports.crypto.openDeviceVaultKeyEnvelope,
    ).mock.results[0]!.value;
    for (const secret of [
      privateState.devicePrivateSignKey,
      privateState.devicePrivateVaultKey,
      privateState.deviceLocalProtectionKey,
      vaultMasterKey,
    ]) {
      expect(Array.from(new Uint8Array(secret))).toEqual([0]);
    }
  });

  it("reports success when completed pending-state cleanup fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.vaultLocalRepository.removePendingDeviceEnrollment,
    ).mockRejectedValueOnce(new Error("pending cleanup failed"));

    await expect(
      ctx.useCase.execute({
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
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
      revision: 1,
      localAccessGenerationId: ctx.values.localAccessGenerationId,
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
        syncConfig: ctx.values.syncConfigInput,
        enrollmentResponse: ctx.response,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
        lockAfterMs: 60_000,
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
