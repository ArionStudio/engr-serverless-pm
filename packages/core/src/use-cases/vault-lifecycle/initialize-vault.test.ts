import type { InitializeVaultOrganizationInput } from "./initialize-vault";
import { describe, expect, it, vi } from "vitest";
import { createInitializeVaultTestContext } from "../../__tests__/fixtures/initialize-vault";
import type { RawMasterPassword } from "../../domain/master-password";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
import { RecoveryMnemonicEncodingError } from "../../errors/recovery.errors";
import { DeviceAccessMaterialChangedError } from "../../errors/vault-device.errors";
import { InvalidVaultLockDelayError } from "../../errors/vault-session.errors";
import type { VaultSessionActivationAuthorization } from "../../services/session/unlocked-vault-session.service";

describe("InitializeVaultUseCase", () => {
  it("rejects a master password below maximum strength before generating IDs", async () => {
    const ctx = createInitializeVaultTestContext();
    const requireVaultCanBeActivated = vi.spyOn(
      ctx.ports.sessionServices.unlockedVaultSession,
      "requireVaultCanBeActivated",
    );

    await expect(
      ctx.useCase.execute({
        masterPassword: "correcthorsebatterystaple" as RawMasterPassword,
        deviceName: "Laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(InvalidNewMasterPasswordError);

    expect(requireVaultCanBeActivated).not.toHaveBeenCalled();
    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.generateMasterPasswordSalt).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("accepts a maximum-strength master password", async () => {
    const ctx = createInitializeVaultTestContext();
    const masterPassword = "vN7#qL2!xP9@rT4$zK6&" as RawMasterPassword;

    await ctx.useCase.execute({
      masterPassword,
      deviceName: "Laptop",
      lockAfterMs: 60_000,
    });

    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenCalledWith(
      masterPassword,
      ctx.values.masterPasswordSalt,
    );
  });

  it("creates a selected organization in the initial encrypted snapshot", async () => {
    const ctx = createInitializeVaultTestContext();

    await ctx.useCase.execute({
      masterPassword: ctx.values.masterPassword,
      deviceName: "Laptop",
      lockAfterMs: 60_000,
      organization: {
        folders: [
          {
            id: "work",
            name: "Work",
            icon: "briefcase",
            parentId: null,
          },
        ],
        tags: [
          {
            id: "mfa",
            name: "MFA",
            groupId: "status",
            color: "orange",
            shade: 500,
          },
        ],
      },
    });

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).toHaveBeenCalledWith(
      expect.objectContaining({
        folders: [
          expect.objectContaining({
            id: "work",
            createdAt: ctx.values.timestamp,
            versionVector: { [ctx.values.deviceId]: 1 },
          }),
        ],
        tags: [
          expect.objectContaining({
            id: "mfa",
            createdAt: ctx.values.timestamp,
            versionVector: { [ctx.values.deviceId]: 1 },
          }),
        ],
      }),
      ctx.values.vaultMasterKey,
    );
  });

  it.each<{ label: string; organization: InitializeVaultOrganizationInput }>([
    {
      label: "missing parent",
      organization: {
        folders: [
          { id: "child", name: "Child", icon: "folder", parentId: "absent" },
        ],
        tags: [],
      },
    },
    {
      label: "normalized duplicate sibling names",
      organization: {
        folders: [
          { id: "one", name: "Work", icon: "folder", parentId: null },
          { id: "two", name: "ｗｏｒｋ", icon: "folder", parentId: null },
        ],
        tags: [],
      },
    },
    {
      label: "invalid tag input",
      organization: {
        folders: [],
        tags: [
          { id: "tag", name: "", groupId: "topic", color: "blue", shade: 500 },
        ],
      },
    },
  ])(
    "rejects $label before identifiers, authorization or cryptography",
    async ({ organization }) => {
      const ctx = createInitializeVaultTestContext();
      const authorize = vi.spyOn(
        ctx.ports.sessionServices.unlockedVaultSession,
        "requireVaultCanBeActivated",
      );
      await expect(
        ctx.useCase.execute({
          masterPassword: ctx.values.masterPassword,
          deviceName: "Laptop",
          lockAfterMs: 60_000,
          organization,
        }),
      ).rejects.toThrow();
      expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
      expect(authorize).not.toHaveBeenCalled();
      expect(ctx.ports.crypto.generateVaultMasterKey).not.toHaveBeenCalled();
      expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultDisplayName.generateVaultDisplayName,
      ).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
      ).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid freshly generated access generation", async () => {
    const ctx = createInitializeVaultTestContext();
    vi.mocked(ctx.ports.ids.generateId)
      .mockReset()
      .mockResolvedValueOnce(ctx.values.vaultId)
      .mockResolvedValueOnce(ctx.values.deviceId)
      .mockResolvedValueOnce("");

    await expect(
      ctx.useCase.execute({
        masterPassword: ctx.values.masterPassword,
        deviceName: "Laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialChangedError);

    expect(ctx.ports.crypto.generateMasterPasswordSalt).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("creates separate signing and wrapping identities with generation one envelope", async () => {
    const ctx = createInitializeVaultTestContext();

    await ctx.useCase.execute({
      masterPassword: ctx.values.masterPassword,
      deviceName: "Laptop",
      lockAfterMs: 60_000,
    });

    const snapshot = ctx.saved.vaultSnapshot;
    expect(snapshot?.metadata).toMatchObject({
      schemaVersion: 1,
      vaultKeyGeneration: 1,
      algorithmSuiteId: "spm-v1",
    });
    expect(snapshot?.keySlots.deviceSlots).toHaveLength(1);
    expect(snapshot?.keySlots.deviceSlots[0]).toMatchObject({
      deviceId: ctx.values.deviceId,
      vaultKeyGeneration: 1,
    });
    expect(ctx.saved.deviceAccessMaterial).toMatchObject({
      localAccessGenerationId: ctx.values.localAccessGenerationId,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      devicePublicVaultKey: ctx.values.devicePublicVaultKey,
    });
    expect(ctx.saved.deviceAccessRecoveryBackup).toMatchObject({
      localAccessGenerationId: ctx.values.localAccessGenerationId,
    });
    expect(ctx.ports.crypto.wrapLocalKeysPayload).toHaveBeenCalledWith(
      {
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
        devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
        deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
        vaultTrustAnchor: ctx.values.vaultTrustAnchor,
      },
      ctx.values.localKeysProtectionKey,
    );
    expect(ctx.ports.crypto.createDeviceVaultKeyEnvelope).toHaveBeenCalledWith(
      ctx.values.vaultMasterKey,
      ctx.values.devicePublicVaultKey,
      {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vaultKeyGeneration: 1,
        algorithmSuiteId: "spm-v1",
      },
    );
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
    const localRootKey = await vi.mocked(ctx.ports.crypto.deriveLocalRootKey)
      .mock.results[0]!.value;
    const vaultMasterKey = await vi.mocked(
      ctx.ports.crypto.generateVaultMasterKey,
    ).mock.results[0]!.value;
    expect(Array.from(new Uint8Array(localRootKey))).toEqual([0]);
    expect(Array.from(new Uint8Array(vaultMasterKey))).toEqual([2]);
    expect(Array.from(new Uint8Array(ctx.values.localRootKey))).toEqual([2]);
  });

  it("rejects an invalid lock delay before generating identifiers or secrets", async () => {
    const ctx = createInitializeVaultTestContext();

    await expect(
      ctx.useCase.execute({
        masterPassword: ctx.values.masterPassword,
        deviceName: "Laptop",
        lockAfterMs: 1 as never,
      }),
    ).rejects.toBeInstanceOf(InvalidVaultLockDelayError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.generateVaultMasterKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("preserves mnemonic encoding failures without persisting state and wipes owned secrets", async () => {
    const ctx = createInitializeVaultTestContext();
    const encodingError = new RecoveryMnemonicEncodingError();
    vi.mocked(ctx.ports.bip39.recoveryKeyToMnemonic).mockRejectedValueOnce(
      encodingError,
    );

    await expect(
      ctx.useCase.execute({
        masterPassword: ctx.values.masterPassword,
        deviceName: "Laptop",
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
    expect(ctx.saved.localVaultDescriptor).toBeUndefined();
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();

    const vaultMasterKey = await vi.mocked(
      ctx.ports.crypto.generateVaultMasterKey,
    ).mock.results[0]!.value;
    const deviceSignKeyPair = await vi.mocked(
      ctx.ports.crypto.generateDeviceSignKeyPair,
    ).mock.results[0]!.value;
    const deviceVaultKeyPair = await vi.mocked(
      ctx.ports.crypto.generateDeviceVaultKeyPair,
    ).mock.results[0]!.value;
    const deviceLocalProtectionKey = await vi.mocked(
      ctx.ports.crypto.generateDeviceLocalProtectionKey,
    ).mock.results[0]!.value;
    const recoveryKey = await vi.mocked(ctx.ports.crypto.generateRecoveryKey)
      .mock.results[0]!.value;

    for (const buffer of [
      vaultMasterKey,
      deviceSignKeyPair.privateKey,
      deviceVaultKeyPair.privateKey,
      deviceLocalProtectionKey,
      recoveryKey,
    ]) {
      expect(Array.from(new Uint8Array(buffer))).toEqual([0]);
    }
  });

  it("rolls back initialized state when lock scheduling fails", async () => {
    const ctx = createInitializeVaultTestContext();
    vi.mocked(ctx.ports.scheduledTasks.scheduleTask).mockRejectedValueOnce(
      new Error("schedule failed"),
    );

    await expect(
      ctx.useCase.execute({
        masterPassword: ctx.values.masterPassword,
        deviceName: "Laptop",
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
    expect(ctx.saved.localVaultDescriptor).toBeUndefined();
    const vaultMasterKey = await vi.mocked(
      ctx.ports.crypto.generateVaultMasterKey,
    ).mock.results[0]!.value;
    expect(Array.from(new Uint8Array(vaultMasterKey))).toEqual([0]);
    expect(Array.from(new Uint8Array(ctx.values.vaultMasterKey))).toEqual([2]);
  });

  it.each(["revision", "generation", "public key"] as const)(
    "atomically rejects initialized access records with an invalid %s",
    async (invalidPart) => {
      const source = createInitializeVaultTestContext();
      await source.useCase.execute({
        masterPassword: source.values.masterPassword,
        deviceName: "Laptop",
        lockAfterMs: 60_000,
      });
      const initializedParams = vi.mocked(
        source.ports.vaultLocalRepository.saveInitializedLocalVault,
      ).mock.calls[0]?.[0];

      if (initializedParams === undefined) {
        throw new Error("Expected initialized vault records.");
      }

      const ctx = createInitializeVaultTestContext();
      const save = ctx.ports.vaultLocalRepository.saveInitializedLocalVault({
        ...initializedParams,
        deviceAccessMaterial: {
          ...initializedParams.deviceAccessMaterial,
          revision:
            invalidPart === "revision"
              ? initializedParams.deviceAccessMaterial.revision + 1
              : initializedParams.deviceAccessMaterial.revision,
        },
        deviceAccessRecoveryBackup: {
          ...initializedParams.deviceAccessRecoveryBackup,
          localAccessGenerationId:
            invalidPart === "generation"
              ? ctx.values.replacementLocalAccessGenerationId
              : initializedParams.deviceAccessRecoveryBackup
                  .localAccessGenerationId,
          devicePublicSignKey:
            invalidPart === "public key"
              ? (new Uint8Array([1])
                  .buffer as typeof initializedParams.deviceAccessRecoveryBackup.devicePublicSignKey)
              : initializedParams.deviceAccessRecoveryBackup
                  .devicePublicSignKey,
        },
      });

      await expect(save).rejects.toBeInstanceOf(
        DeviceAccessMaterialChangedError,
      );
      expect(ctx.saved.localVaultDescriptor).toBeUndefined();
      expect(ctx.saved.deviceAccessMaterial).toBeUndefined();
      expect(ctx.saved.deviceAccessRecoveryBackup).toBeUndefined();
      expect(ctx.saved.vaultSnapshot).toBeUndefined();
    },
  );

  it("removes initialized local state when session activation fails", async () => {
    const ctx = createInitializeVaultTestContext();
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).mockRejectedValue(new Error("session failed"));

    await expect(
      ctx.useCase.execute({
        masterPassword: ctx.values.masterPassword,
        deviceName: "Laptop",
        lockAfterMs: 60_000,
      }),
    ).rejects.toThrow("session failed");

    const initializedParams = vi.mocked(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).mock.calls[0]?.[0];

    if (initializedParams === undefined) {
      throw new Error("Expected initialized vault records.");
    }

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVaultIfArtifactsMatch,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        vaultId: ctx.values.vaultId,
        expectedDescriptor: initializedParams.descriptor,
        expectedDeviceAccessMaterial: initializedParams.deviceAccessMaterial,
        expectedDeviceAccessRecoveryBackup:
          initializedParams.deviceAccessRecoveryBackup,
        expectedSnapshotDigest: ctx.values.vaultSnapshotDigest,
        expectedCheckpoint: initializedParams.checkpoint,
        expectedSyncCredentialState: null,
      }),
    );
    expect(ctx.ports.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledTimes(1);
  });

  it("keeps initialized persistence and activation in one session operation", async () => {
    const ctx = createInitializeVaultTestContext();
    const saveInitializedLocalVault = vi.mocked(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    );
    const save = saveInitializedLocalVault.getMockImplementation();
    let competingLease:
      | Promise<VaultSessionActivationAuthorization>
      | undefined;

    if (save === undefined) {
      throw new Error("Expected initialized-vault fixture implementation.");
    }

    saveInitializedLocalVault.mockImplementationOnce(async (params) => {
      await save(params);
      competingLease =
        ctx.ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
          ctx.values.vaultId,
        );
    });

    await ctx.useCase.execute({
      masterPassword: ctx.values.masterPassword,
      deviceName: "Laptop",
      lockAfterMs: 60_000,
    });

    if (competingLease === undefined) {
      throw new Error("Expected a competing activation lease.");
    }

    await expect(competingLease).resolves.toEqual({
      localGeneration: 1,
      sharedEpoch: 1,
    });
    expect(ctx.saved.localVaultDescriptor).toBeDefined();
    expect(ctx.saved.unlockedVaultSession).toBeDefined();
  });
});
