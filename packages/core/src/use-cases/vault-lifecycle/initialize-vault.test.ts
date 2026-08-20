import { describe, expect, it, vi } from "vitest";
import { createInitializeVaultTestContext } from "../../__tests__/fixtures/initialize-vault";
import type { RawMasterPassword } from "../../domain/master-password";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
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
