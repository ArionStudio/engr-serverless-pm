import { describe, expect, it, vi } from "vitest";
import { createChangeMasterPasswordTestContext } from "../../__tests__/fixtures/change-master-password";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceAccessMaterialNotFoundForMasterPasswordChangeError,
  VaultMustBeUnlockedForMasterPasswordChangeError,
} from "../../errors/change-master-password.errors";
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

  for (const password of passwords) {
    expect(String(error)).not.toContain(password);
  }

  for (const rawKey of rawKeys) {
    expect(Object.values(error)).not.toContain(rawKey);
  }
}

function expectSecretSafeMaterialChange(
  error: unknown,
  vaultId: string,
  passwords: readonly string[],
  rawKeys: readonly ArrayBuffer[],
): void {
  expect(error).toBeInstanceOf(DeviceAccessMaterialChangedError);

  if (!(error instanceof Error)) {
    throw new Error("Expected a device access material conflict.");
  }

  expect(error.name).toBe("DeviceAccessMaterialChangedError");
  expect(error.message).toBe(
    `Device access material for vault "${vaultId}" changed before save.`,
  );
  expect(error.cause).toBeUndefined();

  for (const password of passwords) {
    expect(String(error)).not.toContain(password);
  }

  for (const rawKey of rawKeys) {
    expect(Object.values(error)).not.toContain(rawKey);
  }
}

describe("ChangeMasterPasswordUseCase", () => {
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
      ctx.ports.vaultLocalRepository.getDeviceAccessMaterial,
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
      masterPasswordSalt: ctx.values.newMasterPasswordSalt,
      localKeysProtectionSalt: ctx.values.newLocalKeysProtectionSalt,
      protectedLocalKeys: ctx.values.reprotectedLocalKeys,
    });
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
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
      ctx.ports.vaultLocalRepository.getDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
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
      ctx.ports.vaultLocalRepository.getDeviceAccessMaterial,
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
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
  });

  it("fails when device access material uses unsupported algorithm suite", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.deviceAccessMaterial = {
      ...ctx.deviceAccessMaterial,
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
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
  });

  it("rejects device access material for another vault before key derivation", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    vi.mocked(
      ctx.ports.vaultLocalRepository.getDeviceAccessMaterial,
    ).mockResolvedValueOnce({
      ...ctx.deviceAccessMaterial,
      vaultId: "another-vault-id",
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
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
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
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
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
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
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
      expect(ctx.ports.crypto.generateMasterPasswordSalt).not.toHaveBeenCalled();
      expect(ctx.ports.crypto.wrapLocalKeysPayload).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
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
      expect(ctx.ports.crypto.generateMasterPasswordSalt).not.toHaveBeenCalled();
      expect(ctx.ports.crypto.wrapLocalKeysPayload).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
      ).not.toHaveBeenCalled();
    },
  );

  it("does not allow vault lock to interleave with password rotation", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    let continueWrapping!: () => void;
    let markWrappingStarted!: () => void;
    const wrappingStarted = new Promise<void>((resolve) => {
      markWrappingStarted = resolve;
    });
    const wrappingCanContinue = new Promise<void>((resolve) => {
      continueWrapping = resolve;
    });

    vi.mocked(ctx.ports.crypto.wrapLocalKeysPayload).mockImplementationOnce(
      async () => {
        markWrappingStarted();
        await wrappingCanContinue;
        return ctx.values.reprotectedLocalKeys;
      },
    );

    const passwordRotation = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await wrappingStarted;
    const lock = ctx.ports.sessionServices.unlockedVaultSession.remove();
    await Promise.resolve();

    expect(ctx.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();

    continueWrapping();
    await passwordRotation;
    await lock;

    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
  });

  it("serializes concurrent password rotations before reading access material", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    let continueFirstWrapping!: () => void;
    let markFirstWrappingStarted!: () => void;
    const firstWrappingStarted = new Promise<void>((resolve) => {
      markFirstWrappingStarted = resolve;
    });
    const firstWrappingCanContinue = new Promise<void>((resolve) => {
      continueFirstWrapping = resolve;
    });

    vi.mocked(ctx.ports.crypto.wrapLocalKeysPayload).mockImplementationOnce(
      async () => {
        markFirstWrappingStarted();
        await firstWrappingCanContinue;
        return ctx.values.reprotectedLocalKeys;
      },
    );

    const firstRotation = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await firstWrappingStarted;

    const secondRotation = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.newMasterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });
    await Promise.resolve();

    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessMaterial,
    ).toHaveBeenCalledTimes(1);

    continueFirstWrapping();
    await firstRotation;
    await secondRotation;

    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessMaterial,
    ).toHaveBeenCalledTimes(2);
    expect(ctx.ports.crypto.unwrapLocalKeysPayload).toHaveBeenNthCalledWith(
      2,
      ctx.values.reprotectedLocalKeys,
      ctx.values.newLocalKeysProtectionKey,
    );
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).toHaveBeenCalledTimes(2);
  });

  it("rejects instead of overwriting material replaced by another writer", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    let continueWrapping!: () => void;
    let markWrappingStarted!: () => void;
    const wrappingStarted = new Promise<void>((resolve) => {
      markWrappingStarted = resolve;
    });
    const wrappingCanContinue = new Promise<void>((resolve) => {
      continueWrapping = resolve;
    });

    vi.mocked(ctx.ports.crypto.wrapLocalKeysPayload).mockImplementationOnce(
      async () => {
        markWrappingStarted();
        await wrappingCanContinue;
        return ctx.values.reprotectedLocalKeys;
      },
    );

    const passwordRotation = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await wrappingStarted;

    const concurrentlyReplacedMaterial = {
      ...ctx.deviceAccessMaterial,
      revision: ctx.deviceAccessMaterial.revision + 1,
      protectedLocalKeys: ctx.values.recoveryProtectedLocalKeys,
    };
    ctx.saved.deviceAccessMaterial = concurrentlyReplacedMaterial;

    const materialChange = passwordRotation.catch(
      (caught: unknown) => caught,
    );
    continueWrapping();
    const error = await materialChange;

    expectSecretSafeMaterialChange(
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

    expect(ctx.saved.deviceAccessMaterial).toEqual(
      concurrentlyReplacedMaterial,
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
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
  });
});
