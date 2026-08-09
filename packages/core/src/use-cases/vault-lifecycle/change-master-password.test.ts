import { describe, expect, it, vi } from "vitest";
import { createChangeMasterPasswordTestContext } from "../../__tests__/fixtures/change-master-password";
import {
  expectErrorDoesNotContainSecrets,
  expectSecretSafeDeviceAccessMaterialChange,
} from "../../__tests__/fixtures/device-access-errors";
import type { RawMasterPassword } from "../../domain/master-password";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceAccessMaterialNotFoundForMasterPasswordChangeError,
  VaultMustBeUnlockedForMasterPasswordChangeError,
} from "../../errors/change-master-password.errors";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
import {
  DeviceAccessMaterialChangedError,
  DeviceAccessMaterialIdentityMismatchError,
} from "../../errors/vault-device.errors";

function expectSecretSafeIdentityMismatch(
  error: unknown,
  vaultId: string,
  passwords: readonly string[],
  rawKeys: readonly ArrayBuffer[],
): void {
  expect(error).toBeInstanceOf(DeviceAccessMaterialIdentityMismatchError);

  if (!(error instanceof Error)) {
    throw new Error("Expected an identity mismatch error.");
  }

  expect(error.message).toBe(
    `Device access material does not match the expected identity for vault "${vaultId}".`,
  );
  expect(error.cause).toBeUndefined();

  expectErrorDoesNotContainSecrets({
    error,
    stringSecrets: passwords,
    objectSecrets: rawKeys,
  });
}

function createDeferredSignal() {
  let resolveSignal: (() => void) | undefined;
  const signaled = new Promise<void>((resolve) => {
    resolveSignal = resolve;
  });

  return {
    signal: () => {
      if (resolveSignal === undefined) {
        throw new Error("Expected a deferred signal resolver.");
      }

      resolveSignal();
    },
    signaled,
  };
}

function deferWrapping(
  ctx: ReturnType<typeof createChangeMasterPasswordTestContext>,
) {
  const wrappingStarted = createDeferredSignal();
  const wrappingCanContinue = createDeferredSignal();

  vi.mocked(ctx.ports.crypto.wrapLocalKeysPayload).mockImplementationOnce(
    async () => {
      wrappingStarted.signal();
      await wrappingCanContinue.signaled;
      return ctx.values.reprotectedLocalKeys;
    },
  );

  return {
    resume: wrappingCanContinue.signal,
    started: wrappingStarted.signaled,
  };
}

describe("ChangeMasterPasswordUseCase", () => {
  it("rejects a new password below maximum strength before reading the session", async () => {
    const ctx = createChangeMasterPasswordTestContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: "12345678901" as RawMasterPassword,
        newMasterPassword: "correcthorsebatterystaple" as RawMasterPassword,
      }),
    ).rejects.toBeInstanceOf(InvalidNewMasterPasswordError);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.get,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecords,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.generateMasterPasswordSalt).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.generateLocalKeysProtectionSalt,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });

  it("accepts a maximum-strength new password while verifying a weak current password", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    const currentMasterPassword = "12345678901" as RawMasterPassword;
    const newMasterPassword = "mQ8#sW3!cH7@uJ5$eR9%" as RawMasterPassword;

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword,
      newMasterPassword,
    });

    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenNthCalledWith(
      1,
      currentMasterPassword,
      ctx.values.masterPasswordSalt,
    );
    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenNthCalledWith(
      2,
      newMasterPassword,
      ctx.values.newMasterPasswordSalt,
    );
  });

  it("re-protects local device access material with the new master password", async () => {
    const ctx = createChangeMasterPasswordTestContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).resolves.toBeUndefined();

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.get,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecords,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenNthCalledWith(
      1,
      ctx.values.masterPassword,
      ctx.values.masterPasswordSalt,
    );
    expect(
      ctx.ports.crypto.deriveLocalKeysProtectionKey,
    ).toHaveBeenNthCalledWith(
      1,
      ctx.values.localRootKey,
      ctx.values.localKeysProtectionSalt,
    );
    expect(ctx.ports.crypto.unwrapLocalKeysPayload).toHaveBeenCalledWith(
      ctx.values.protectedLocalKeys,
      ctx.values.localKeysProtectionKey,
    );
    expect(ctx.ports.crypto.verifyDeviceSignKeyPair).toHaveBeenCalledTimes(3);
    expect(ctx.ports.crypto.verifyDeviceSignKeyPair).toHaveBeenCalledWith(
      ctx.values.devicePublicSignKey,
      ctx.values.devicePrivateSignKey,
    );
    expect(ctx.ports.crypto.verifyDeviceVaultKeyPair).toHaveBeenCalledTimes(3);
    expect(ctx.ports.crypto.verifyDeviceVaultKeyPair).toHaveBeenCalledWith(
      ctx.values.devicePublicVaultKey,
      ctx.values.devicePrivateVaultKey,
    );
    expect(ctx.ports.crypto.generateMasterPasswordSalt).toHaveBeenCalledTimes(
      1,
    );
    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenNthCalledWith(
      2,
      ctx.values.newMasterPassword,
      ctx.values.newMasterPasswordSalt,
    );
    expect(
      ctx.ports.crypto.generateLocalKeysProtectionSalt,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.crypto.deriveLocalKeysProtectionKey,
    ).toHaveBeenNthCalledWith(
      2,
      ctx.values.newLocalRootKey,
      ctx.values.newLocalKeysProtectionSalt,
    );
    expect(ctx.ports.crypto.wrapLocalKeysPayload).toHaveBeenCalledWith(
      {
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
        devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
        deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
        vaultTrustAnchor: ctx.values.vaultTrustAnchor,
      },
      ctx.values.newLocalKeysProtectionKey,
    );

    expect(ctx.saved.deviceAccessMaterial).toEqual({
      ...ctx.deviceAccessMaterial,
      revision: ctx.deviceAccessMaterial.revision + 1,
      localAccessGenerationId:
        ctx.values.replacementLocalAccessGenerationId,
      masterPasswordSalt: ctx.values.newMasterPasswordSalt,
      localKeysProtectionSalt: ctx.values.newLocalKeysProtectionSalt,
      protectedLocalKeys: ctx.values.reprotectedLocalKeys,
    });
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual({
      ...ctx.deviceAccessRecoveryBackup,
      revision: ctx.deviceAccessRecoveryBackup.revision + 1,
      localAccessGenerationId:
        ctx.values.replacementLocalAccessGenerationId,
    });
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).toHaveBeenCalledTimes(1);
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedForMasterPasswordChangeError);

    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecords,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });

  it("fails when another vault is unlocked", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.unlockedVaultSession = {
      ...ctx.saved.unlockedVaultSession!,
      unlockedVault: {
        ...ctx.saved.unlockedVaultSession!.unlockedVault,
        vaultId: "another-vault-id",
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedForMasterPasswordChangeError);

    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });

  it("fails when device access material is missing", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.deviceAccessMaterial = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(
      DeviceAccessMaterialNotFoundForMasterPasswordChangeError,
    );

    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });

  it("fails when device access material uses unsupported algorithm suite", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.deviceAccessMaterial = {
      ...ctx.deviceAccessMaterial,
      algorithmSuiteId: "spm-unsupported",
    };
    ctx.saved.deviceAccessRecoveryBackup = {
      ...ctx.deviceAccessRecoveryBackup,
      algorithmSuiteId: "spm-unsupported",
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(UnsupportedAlgorithmSuiteError);

    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.unwrapLocalKeysPayload).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.wrapLocalKeysPayload).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });

  it("rejects device access material for another vault before key derivation", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    vi.mocked(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecords,
    ).mockResolvedValueOnce({
      deviceAccessMaterial: {
        ...ctx.deviceAccessMaterial,
        vaultId: "another-vault-id",
      },
      deviceAccessRecoveryBackup: ctx.deviceAccessRecoveryBackup,
    });

    const execution = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    const error = await execution.catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DeviceAccessMaterialIdentityMismatchError);

    if (!(error instanceof Error)) {
      throw new Error("Expected an identity mismatch error.");
    }

    expect(error.name).toBe("DeviceAccessMaterialIdentityMismatchError");
    expect(error.message).toBe(
      'Device access material does not match the expected identity for vault "vault-id".',
    );
    expect(error.cause).toBeUndefined();
    expect(String(error)).not.toContain(ctx.values.masterPassword);
    expect(String(error)).not.toContain(ctx.values.newMasterPassword);
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });

  it("rejects device access material for another device before key derivation", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.deviceAccessMaterial = {
      ...ctx.deviceAccessMaterial,
      deviceId: "another-device-id",
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialIdentityMismatchError);

    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });

  it("rejects a material identity absent from the active trusted context", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked vault session.");
    }

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        trustedSnapshotContext: {
          ...session.unlockedVault.trustedSnapshotContext,
          trust: {
            ...session.unlockedVault.trustedSnapshotContext.trust,
            trustedDevices: [],
          },
        },
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialIdentityMismatchError);

    expect(ctx.ports.crypto.verifyDeviceSignKeyPair).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });

  it.each(["signing", "wrapping"] as const)(
    "rejects foreign %s material before key derivation",
    async (keyKind) => {
      const ctx = createChangeMasterPasswordTestContext();

      if (keyKind === "signing") {
        ctx.saved.deviceAccessMaterial = {
          ...ctx.deviceAccessMaterial,
          devicePublicSignKey: ctx.values.pendingDevicePublicSignKey,
        };
        vi.mocked(ctx.ports.crypto.verifyDeviceSignKeyPair).mockImplementation(
          async (publicKey, privateKey) =>
            (publicKey === ctx.values.devicePublicSignKey &&
              privateKey === ctx.values.devicePrivateSignKey) ||
            (publicKey === ctx.values.pendingDevicePublicSignKey &&
              privateKey === ctx.values.pendingDevicePrivateSignKey),
        );
      } else {
        ctx.saved.deviceAccessMaterial = {
          ...ctx.deviceAccessMaterial,
          devicePublicVaultKey: ctx.values.pendingDevicePublicVaultKey,
        };
        vi.mocked(ctx.ports.crypto.verifyDeviceVaultKeyPair).mockImplementation(
          async (publicKey, privateKey) =>
            (publicKey === ctx.values.devicePublicVaultKey &&
              privateKey === ctx.values.devicePrivateVaultKey) ||
            (publicKey === ctx.values.pendingDevicePublicVaultKey &&
              privateKey === ctx.values.pendingDevicePrivateVaultKey),
        );
      }

      const error = await ctx.useCase
        .execute({
          vaultId: ctx.values.vaultId,
          currentMasterPassword: ctx.values.masterPassword,
          newMasterPassword: ctx.values.newMasterPassword,
        })
        .catch((caught: unknown) => caught);

      expectSecretSafeIdentityMismatch(
        error,
        ctx.values.vaultId,
        [ctx.values.masterPassword, ctx.values.newMasterPassword],
        [
          ctx.values.devicePublicSignKey,
          ctx.values.devicePrivateSignKey,
          ctx.values.devicePublicVaultKey,
          ctx.values.devicePrivateVaultKey,
          ctx.values.pendingDevicePublicSignKey,
          ctx.values.pendingDevicePrivateSignKey,
          ctx.values.pendingDevicePublicVaultKey,
          ctx.values.pendingDevicePrivateVaultKey,
        ],
      );

      expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
      expect(
        ctx.ports.crypto.generateMasterPasswordSalt,
      ).not.toHaveBeenCalled();
      expect(ctx.ports.crypto.wrapLocalKeysPayload).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
      ).not.toHaveBeenCalled();
    },
  );

  it("rejects material from a different local access generation before crypto work", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.deviceAccessRecoveryBackup = {
      ...ctx.deviceAccessRecoveryBackup,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    };

    const error = await ctx.useCase
      .execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      })
      .catch((caught: unknown) => caught);

    expectSecretSafeIdentityMismatch(
      error,
      ctx.values.vaultId,
      [ctx.values.masterPassword, ctx.values.newMasterPassword],
      [
        ctx.values.devicePublicSignKey,
        ctx.values.devicePrivateSignKey,
        ctx.values.devicePublicVaultKey,
        ctx.values.devicePrivateVaultKey,
      ],
    );
    expect(ctx.ports.crypto.verifyDeviceSignKeyPair).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
  });

  it("rejects missing persisted generation IDs before crypto work", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.deviceAccessMaterial = {
      ...ctx.deviceAccessMaterial,
      localAccessGenerationId: undefined as unknown as string,
    };
    ctx.saved.deviceAccessRecoveryBackup = {
      ...ctx.deviceAccessRecoveryBackup,
      localAccessGenerationId: undefined as unknown as string,
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialIdentityMismatchError);

    expect(ctx.ports.crypto.verifyDeviceSignKeyPair).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
  });

  it.each(["", "local-access-generation-id"])(
    "rejects invalid or reused freshly generated access generation %j before crypto work",
    async (generatedId) => {
      const ctx = createChangeMasterPasswordTestContext();
      vi.mocked(ctx.ports.ids.generateId)
        .mockReset()
        .mockResolvedValue(generatedId);

      await expect(
        ctx.useCase.execute({
          vaultId: ctx.values.vaultId,
          currentMasterPassword: ctx.values.masterPassword,
          newMasterPassword: ctx.values.newMasterPassword,
        }),
      ).rejects.toBeInstanceOf(DeviceAccessMaterialChangedError);

      expect(ctx.ports.crypto.verifyDeviceSignKeyPair).not.toHaveBeenCalled();
      expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
      ).not.toHaveBeenCalled();
    },
  );

  it.each(["signing", "wrapping"] as const)(
    "rejects an unwrapped %s private key outside the active identity",
    async (keyKind) => {
      const ctx = createChangeMasterPasswordTestContext();
      vi.mocked(ctx.ports.crypto.unwrapLocalKeysPayload).mockResolvedValueOnce({
        devicePrivateSignKey:
          keyKind === "signing"
            ? ctx.values.pendingDevicePrivateSignKey
            : ctx.values.devicePrivateSignKey,
        devicePrivateVaultKey:
          keyKind === "wrapping"
            ? ctx.values.pendingDevicePrivateVaultKey
            : ctx.values.devicePrivateVaultKey,
        deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
        vaultTrustAnchor: ctx.values.vaultTrustAnchor,
      });
      vi.mocked(ctx.ports.crypto.verifyDeviceSignKeyPair).mockImplementation(
        async (publicKey, privateKey) =>
          publicKey === ctx.values.devicePublicSignKey &&
          privateKey === ctx.values.devicePrivateSignKey,
      );
      vi.mocked(ctx.ports.crypto.verifyDeviceVaultKeyPair).mockImplementation(
        async (publicKey, privateKey) =>
          publicKey === ctx.values.devicePublicVaultKey &&
          privateKey === ctx.values.devicePrivateVaultKey,
      );

      const error = await ctx.useCase
        .execute({
          vaultId: ctx.values.vaultId,
          currentMasterPassword: ctx.values.masterPassword,
          newMasterPassword: ctx.values.newMasterPassword,
        })
        .catch((caught: unknown) => caught);

      expectSecretSafeIdentityMismatch(
        error,
        ctx.values.vaultId,
        [ctx.values.masterPassword, ctx.values.newMasterPassword],
        [
          ctx.values.devicePublicSignKey,
          ctx.values.devicePrivateSignKey,
          ctx.values.devicePublicVaultKey,
          ctx.values.devicePrivateVaultKey,
          ctx.values.pendingDevicePrivateSignKey,
          ctx.values.pendingDevicePrivateVaultKey,
        ],
      );

      expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenCalledTimes(1);
      expect(
        ctx.ports.crypto.generateMasterPasswordSalt,
      ).not.toHaveBeenCalled();
      expect(ctx.ports.crypto.wrapLocalKeysPayload).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
      ).not.toHaveBeenCalled();
    },
  );

  it("does not allow vault lock to interleave with password rotation", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    const wrapping = deferWrapping(ctx);

    const passwordRotation = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await wrapping.started;
    const lock = ctx.ports.sessionServices.unlockedVaultSession.remove();
    await Promise.resolve();

    expect(ctx.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();

    wrapping.resume();
    await passwordRotation;
    await lock;

    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
  });

  it("serializes concurrent password rotations before reading access material", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    const firstWrapping = deferWrapping(ctx);

    const firstRotation = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await firstWrapping.started;

    const secondRotation = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.newMasterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });
    await Promise.resolve();

    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecords,
    ).toHaveBeenCalledTimes(1);

    firstWrapping.resume();
    await firstRotation;
    await secondRotation;

    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecords,
    ).toHaveBeenCalledTimes(2);
    expect(ctx.ports.crypto.unwrapLocalKeysPayload).toHaveBeenNthCalledWith(
      2,
      ctx.values.reprotectedLocalKeys,
      ctx.values.newLocalKeysProtectionKey,
    );
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).toHaveBeenCalledTimes(2);
  });

  it("rejects instead of overwriting material replaced by another writer", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    const wrapping = deferWrapping(ctx);

    const passwordRotation = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await wrapping.started;

    const concurrentlyReplacedMaterial = {
      ...ctx.deviceAccessMaterial,
      revision: ctx.deviceAccessMaterial.revision + 1,
      protectedLocalKeys: ctx.values.recoveryProtectedLocalKeys,
    };
    ctx.saved.deviceAccessMaterial = concurrentlyReplacedMaterial;

    const materialChange = passwordRotation.catch((caught: unknown) => caught);
    wrapping.resume();
    const error = await materialChange;

    expectSecretSafeDeviceAccessMaterialChange({
      error,
      vaultId: ctx.values.vaultId,
      passwords: [ctx.values.masterPassword, ctx.values.newMasterPassword],
      rawDeviceKeys: [
        ctx.values.devicePublicSignKey,
        ctx.values.devicePrivateSignKey,
        ctx.values.devicePublicVaultKey,
        ctx.values.devicePrivateVaultKey,
      ],
    });

    expect(ctx.saved.deviceAccessMaterial).toEqual(
      concurrentlyReplacedMaterial,
    );
  });

  it("rejects instead of writing after the recovery companion changes", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    const wrapping = deferWrapping(ctx);
    const originalDeviceAccessMaterial = ctx.saved.deviceAccessMaterial;
    const passwordRotation = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await wrapping.started;
    const concurrentlyReplacedBackup = {
      ...ctx.deviceAccessRecoveryBackup,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    };
    ctx.saved.deviceAccessRecoveryBackup = concurrentlyReplacedBackup;

    const materialChange = passwordRotation.catch((caught: unknown) => caught);
    wrapping.resume();
    expectSecretSafeDeviceAccessMaterialChange({
      error: await materialChange,
      vaultId: ctx.values.vaultId,
      passwords: [ctx.values.masterPassword, ctx.values.newMasterPassword],
      rawDeviceKeys: [
        ctx.values.devicePublicSignKey,
        ctx.values.devicePrivateSignKey,
        ctx.values.devicePublicVaultKey,
        ctx.values.devicePrivateVaultKey,
      ],
    });

    expect(ctx.saved.deviceAccessMaterial).toEqual(
      originalDeviceAccessMaterial,
    );
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(
      concurrentlyReplacedBackup,
    );
  });

  it("rejects reset revisions from a new local access generation", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    const wrapping = deferWrapping(ctx);
    const passwordRotation = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await wrapping.started;

    const reinitializedMaterial = {
      ...ctx.deviceAccessMaterial,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    };
    ctx.saved.deviceAccessMaterial = reinitializedMaterial;

    const materialChange = passwordRotation.catch((caught: unknown) => caught);
    wrapping.resume();
    expectSecretSafeDeviceAccessMaterialChange({
      error: await materialChange,
      vaultId: ctx.values.vaultId,
      passwords: [ctx.values.masterPassword, ctx.values.newMasterPassword],
      rawDeviceKeys: [
        ctx.values.devicePublicSignKey,
        ctx.values.devicePrivateSignKey,
        ctx.values.devicePublicVaultKey,
        ctx.values.devicePrivateVaultKey,
      ],
    });

    expect(ctx.saved.deviceAccessMaterial).toEqual(reinitializedMaterial);
  });

  it.each([
    0,
    1.5,
    Number.MAX_SAFE_INTEGER,
    Number.POSITIVE_INFINITY,
    null as unknown as number,
  ])(
    "rejects invalid or exhausted access-material revision %s before crypto work",
    async (revision) => {
      const ctx = createChangeMasterPasswordTestContext();
      ctx.saved.deviceAccessMaterial = {
        ...ctx.deviceAccessMaterial,
        revision,
      };

      const materialChange = ctx.useCase
        .execute({
          vaultId: ctx.values.vaultId,
          currentMasterPassword: ctx.values.masterPassword,
          newMasterPassword: ctx.values.newMasterPassword,
        })
        .catch((caught: unknown) => caught);

      expectSecretSafeDeviceAccessMaterialChange({
        error: await materialChange,
        vaultId: ctx.values.vaultId,
        passwords: [ctx.values.masterPassword, ctx.values.newMasterPassword],
        rawDeviceKeys: [
          ctx.values.devicePublicSignKey,
          ctx.values.devicePrivateSignKey,
          ctx.values.devicePublicVaultKey,
          ctx.values.devicePrivateVaultKey,
        ],
      });
      expect(ctx.ports.crypto.verifyDeviceSignKeyPair).not.toHaveBeenCalled();
      expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
      ).not.toHaveBeenCalled();
    },
  );

  it("atomically rejects a replacement revision that is not the exact successor", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    const originalDeviceAccessMaterial = ctx.saved.deviceAccessMaterial;

    const materialChange = ctx.ports.vaultLocalRepository
      .saveDeviceAccessRecords({
        expectedDeviceAccessMaterialRevision: ctx.deviceAccessMaterial.revision,
        expectedDeviceAccessMaterialGenerationId:
          ctx.deviceAccessMaterial.localAccessGenerationId,
        expectedDeviceAccessRecoveryBackupRevision:
          ctx.deviceAccessRecoveryBackup.revision,
        expectedDeviceAccessRecoveryBackupGenerationId:
          ctx.deviceAccessRecoveryBackup.localAccessGenerationId,
        deviceAccessMaterial: {
          ...ctx.deviceAccessMaterial,
          revision: ctx.deviceAccessMaterial.revision + 2,
          localAccessGenerationId:
            ctx.values.replacementLocalAccessGenerationId,
        },
        deviceAccessRecoveryBackup: {
          ...ctx.deviceAccessRecoveryBackup,
          revision: ctx.deviceAccessRecoveryBackup.revision + 1,
          localAccessGenerationId:
            ctx.values.replacementLocalAccessGenerationId,
        },
      })
      .catch((caught: unknown) => caught);

    expectSecretSafeDeviceAccessMaterialChange({
      error: await materialChange,
      vaultId: ctx.values.vaultId,
      passwords: [ctx.values.masterPassword, ctx.values.newMasterPassword],
      rawDeviceKeys: [
        ctx.values.devicePublicSignKey,
        ctx.values.devicePrivateSignKey,
        ctx.values.devicePublicVaultKey,
        ctx.values.devicePrivateVaultKey,
      ],
    });
    expect(ctx.saved.deviceAccessMaterial).toEqual(
      originalDeviceAccessMaterial,
    );
  });

  it("does not save updated access material when current password unwrap fails", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    const error = new Error("unwrap failed");

    vi.mocked(ctx.ports.crypto.unwrapLocalKeysPayload).mockRejectedValueOnce(
      error,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toThrow(error);

    expect(ctx.ports.crypto.generateMasterPasswordSalt).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });
});
