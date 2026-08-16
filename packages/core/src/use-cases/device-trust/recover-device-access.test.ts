import { describe, expect, it, vi } from "vitest";
import {
  expectErrorDoesNotContainSecrets,
  expectSecretSafeDeviceAccessMaterialChange,
} from "../../__tests__/fixtures/device-access-errors";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust";
import type { RawMasterPassword } from "../../domain/master-password";
import type { VaultMasterKey } from "../../domain/snapshot";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
import {
  DeviceKeySlotNotFoundError,
  DeviceKeySlotVerificationFailedError,
} from "../../errors/unlock-vault.errors";
import {
  DeviceAccessMaterialChangedError,
  DeviceAccessMaterialIdentityMismatchError,
} from "../../errors/vault-device.errors";
import { ChangeMasterPasswordUseCase } from "../vault-lifecycle/change-master-password";
import { UnlockVaultUseCase } from "../vault-lifecycle/unlock-vault";
import { RecoverDeviceAccessUseCase } from "./recover-device-access";

function createContext() {
  const ctx = createUnlockVaultTestContext();
  vi.mocked(ctx.ports.ids.generateId).mockReset();
  vi.mocked(ctx.ports.ids.generateId).mockResolvedValue(
    ctx.values.replacementLocalAccessGenerationId,
  );
  const backup = ctx.deviceAccessRecoveryBackup;
  const useCase = new RecoverDeviceAccessUseCase(
    ctx.ports.bip39,
    ctx.ports.crypto,
    ctx.ports.ids,
    ctx.ports.sessionServices.unlockedVaultSession,
    ctx.ports.vaultLocalRepository,
  );

  return { ...ctx, backup, useCase };
}

function deferRecoveryReplacement(ctx: ReturnType<typeof createContext>) {
  vi.mocked(ctx.ports.crypto.generateRecoveryKey).mockResolvedValue(
    ctx.values.rotatedRecoverySecretKey,
  );
  vi.mocked(
    ctx.ports.crypto.generateRecoveryLocalKeysProtectionSalt,
  ).mockResolvedValue(ctx.values.rotatedRecoveryLocalKeysProtectionSalt);

  const deriveRecoveryLocalKeysProtectionKey = vi.mocked(
    ctx.ports.crypto.deriveRecoveryLocalKeysProtectionKey,
  );
  const defaultDeriveRecoveryLocalKeysProtectionKey =
    deriveRecoveryLocalKeysProtectionKey.getMockImplementation();

  if (defaultDeriveRecoveryLocalKeysProtectionKey === undefined) {
    throw new Error("Expected a recovery-key derivation implementation.");
  }

  let rotatedRecoveryLocalKeysProtectionKey: ArrayBuffer | undefined;
  deriveRecoveryLocalKeysProtectionKey.mockImplementation(
    async (recoveryKey, salt) => {
      const protectionKey = await defaultDeriveRecoveryLocalKeysProtectionKey(
        recoveryKey,
        salt,
      );

      if (salt === ctx.values.rotatedRecoveryLocalKeysProtectionSalt) {
        rotatedRecoveryLocalKeysProtectionKey = protectionKey;
      }

      return protectionKey;
    },
  );

  const wrapLocalKeysPayload = vi.mocked(ctx.ports.crypto.wrapLocalKeysPayload);
  const defaultWrapLocalKeysPayload =
    wrapLocalKeysPayload.getMockImplementation();

  if (defaultWrapLocalKeysPayload === undefined) {
    throw new Error("Expected a local-key wrapping implementation.");
  }

  let continueRecoveryWrapping!: () => void;
  let markRecoveryWrappingStarted!: () => void;
  const recoveryWrappingStarted = new Promise<void>((resolve) => {
    markRecoveryWrappingStarted = resolve;
  });
  const recoveryWrappingCanContinue = new Promise<void>((resolve) => {
    continueRecoveryWrapping = resolve;
  });
  let wrapCallCount = 0;
  wrapLocalKeysPayload.mockImplementation(async (payload, protectionKey) => {
    wrapCallCount += 1;

    if (wrapCallCount === 2) {
      expect(rotatedRecoveryLocalKeysProtectionKey).toBeDefined();
      expect(protectionKey).toBe(rotatedRecoveryLocalKeysProtectionKey);
      markRecoveryWrappingStarted();
      await recoveryWrappingCanContinue;
    }

    return defaultWrapLocalKeysPayload(payload, protectionKey);
  });

  return {
    continueRecoveryWrapping,
    recoveryWrappingStarted,
  };
}

describe("RecoverDeviceAccessUseCase", () => {
  it("rejects a new password below maximum strength before reading recovery state", async () => {
    const ctx = createContext();
    const requireVaultCanBeActivated = vi.spyOn(
      ctx.ports.sessionServices.unlockedVaultSession,
      "requireVaultCanBeActivated",
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: "correcthorsebatterystaple" as RawMasterPassword,
      }),
    ).rejects.toBeInstanceOf(InvalidNewMasterPasswordError);

    expect(requireVaultCanBeActivated).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });

  it("accepts a maximum-strength new password", async () => {
    const ctx = createContext();
    const newMasterPassword = "mQ8#sW3!cH7@uJ5$eR9%" as RawMasterPassword;

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword,
    });

    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenCalledWith(
      newMasterPassword,
      ctx.values.masterPasswordSalt,
    );
  });

  it("stops recovery before key checks, decryption, wrapping, or persistence when authenticated local keys are malformed", async () => {
    const ctx = createContext();
    const decodeError = new Error("local keys payload is malformed");
    vi.mocked(ctx.ports.crypto.unwrapLocalKeysPayload).mockRejectedValueOnce(
      decodeError,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBe(decodeError);

    expect(ctx.ports.crypto.verifyDeviceSignKeyPair).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.verifyDeviceVaultKeyPair).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.decryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.wrapLocalKeysPayload).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
  });

  it("replaces the current local backup without changing the trusted identity", async () => {
    const ctx = createContext();
    const recoveredVaultMasterKey = new Uint8Array([7])
      .buffer as VaultMasterKey;
    vi.mocked(ctx.ports.crypto.generateMasterPasswordSalt)
      .mockReset()
      .mockResolvedValue(ctx.values.newMasterPasswordSalt);
    vi.mocked(ctx.ports.crypto.generateLocalKeysProtectionSalt)
      .mockReset()
      .mockResolvedValue(ctx.values.newLocalKeysProtectionSalt);
    vi.mocked(ctx.ports.crypto.generateRecoveryKey).mockResolvedValueOnce(
      ctx.values.rotatedRecoverySecretKey,
    );
    vi.mocked(
      ctx.ports.crypto.generateRecoveryLocalKeysProtectionSalt,
    ).mockResolvedValueOnce(ctx.values.rotatedRecoveryLocalKeysProtectionSalt);
    vi.mocked(
      ctx.ports.crypto.openDeviceVaultKeyEnvelope,
    ).mockResolvedValueOnce(recoveredVaultMasterKey);

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    expect(result).toEqual({
      deviceId: ctx.values.deviceId,
      recoveryMnemonicKey: ctx.values.rotatedRecoveryMnemonicKey,
    });
    expect(ctx.ports.crypto.verifyDeviceVaultKeyPair).toHaveBeenCalledWith(
      ctx.values.devicePublicVaultKey,
      ctx.values.devicePrivateVaultKey,
    );
    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).toHaveBeenCalled();
    expect(
      ctx.ports.crypto.deriveRecoveryLocalKeysProtectionKey,
    ).toHaveBeenNthCalledWith(
      2,
      ctx.values.rotatedRecoverySecretKey,
      ctx.values.rotatedRecoveryLocalKeysProtectionSalt,
    );
    const wrapLocalKeysPayload = vi.mocked(
      ctx.ports.crypto.wrapLocalKeysPayload,
    );
    expect(wrapLocalKeysPayload).toHaveBeenCalledTimes(2);
    expect(wrapLocalKeysPayload.mock.calls[0]![0]).toBe(
      wrapLocalKeysPayload.mock.calls[1]![0],
    );
    expect(Object.keys(wrapLocalKeysPayload.mock.calls[0]![0])).toEqual([
      "devicePrivateSignKey",
      "devicePrivateVaultKey",
      "deviceLocalProtectionKey",
      "vaultTrustAnchor",
    ]);
    expect(ctx.saved.deviceAccessMaterial).toMatchObject({
      revision: ctx.deviceAccessMaterial.revision + 1,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
      masterPasswordSalt: ctx.values.newMasterPasswordSalt,
      localKeysProtectionSalt: ctx.values.newLocalKeysProtectionSalt,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      devicePublicVaultKey: ctx.values.devicePublicVaultKey,
      protectedLocalKeys: ctx.values.reprotectedLocalKeys,
    });
    expect(ctx.saved.deviceAccessRecoveryBackup).toMatchObject({
      revision: ctx.backup.revision + 1,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
      recoveryLocalKeysProtectionSalt:
        ctx.values.rotatedRecoveryLocalKeysProtectionSalt,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      devicePublicVaultKey: ctx.values.devicePublicVaultKey,
      protectedLocalKeys: ctx.values.rotatedRecoveryProtectedLocalKeys,
    });
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).toHaveBeenCalledOnce();
    const recoverySecretKey = await vi.mocked(
      ctx.ports.bip39.mnemonicToRecoveryKey,
    ).mock.results[0]!.value;
    expect(Array.from(new Uint8Array(recoveredVaultMasterKey))).toEqual([0]);
    expect(Array.from(new Uint8Array(recoverySecretKey))).toEqual([0]);
    expect(Array.from(new Uint8Array(ctx.values.recoverySecretKey))).toEqual([
      2,
    ]);
  });

  it("rejects an old backup replay without matching access material", async () => {
    const ctx = createContext();
    const replayedRecoveryBackup = ctx.backup;

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    const recoveredDeviceAccessMaterial = ctx.saved.deviceAccessMaterial;
    const replacementRecoveryBackup = ctx.saved.deviceAccessRecoveryBackup;
    expect(recoveredDeviceAccessMaterial).toMatchObject({
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    });
    expect(replacementRecoveryBackup).toMatchObject({
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    });

    ctx.saved.deviceAccessRecoveryBackup = replayedRecoveryBackup;
    vi.mocked(ctx.ports.bip39.mnemonicToRecoveryKey).mockClear();

    const materialChange = ctx.useCase
      .execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
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
    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.saved.deviceAccessMaterial).toEqual(
      recoveredDeviceAccessMaterial,
    );
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(
      replayedRecoveryBackup,
    );
  });

  it("rejects an old material replay before deriving its former password", async () => {
    const ctx = createContext();
    const replayedDeviceAccessMaterial = ctx.deviceAccessMaterial;

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    ctx.saved.deviceAccessMaterial = replayedDeviceAccessMaterial;
    vi.mocked(ctx.ports.crypto.deriveLocalRootKey).mockClear();
    const unlock = new UnlockVaultUseCase(
      ctx.ports.clock,
      ctx.ports.crypto,
      ctx.ports.ids,
      ctx.ports.scheduledTasks,
      ctx.ports.vaultLocalRepository,
      ctx.ports.vaultLockTasks,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.ports.clipboardOperations,
    );

    await expect(
      unlock.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialIdentityMismatchError);

    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(ctx.ports.vaultLockTasks.save).not.toHaveBeenCalled();
  });

  it.each(["algorithm suite", "signing key", "vault key"] as const)(
    "rejects persisted material with a mismatched %s before recovery secrets",
    async (identityPart) => {
      const ctx = createContext();
      ctx.saved.deviceAccessMaterial = {
        ...ctx.deviceAccessMaterial,
        algorithmSuiteId:
          identityPart === "algorithm suite"
            ? "spm-unsupported"
            : ctx.deviceAccessMaterial.algorithmSuiteId,
        devicePublicSignKey:
          identityPart === "signing key"
            ? (new Uint8Array([1])
                .buffer as typeof ctx.values.devicePublicSignKey)
            : ctx.deviceAccessMaterial.devicePublicSignKey,
        devicePublicVaultKey:
          identityPart === "vault key"
            ? (new Uint8Array([3])
                .buffer as typeof ctx.values.devicePublicVaultKey)
            : ctx.deviceAccessMaterial.devicePublicVaultKey,
      };

      const materialChange = ctx.useCase
        .execute({
          vaultId: ctx.values.vaultId,
          recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
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
          ctx.values.pendingDevicePublicSignKey,
          ctx.values.pendingDevicePublicVaultKey,
        ],
      });
      expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
      ).not.toHaveBeenCalled();
    },
  );

  it("rejects missing persisted generation IDs before recovery secrets", async () => {
    const ctx = createContext();
    ctx.saved.deviceAccessMaterial = {
      ...ctx.deviceAccessMaterial,
      localAccessGenerationId: undefined as unknown as string,
    };
    ctx.saved.deviceAccessRecoveryBackup = {
      ...ctx.backup,
      localAccessGenerationId: undefined as unknown as string,
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialChangedError);

    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });

  it.each(["", "local-access-generation-id"])(
    "rejects invalid or reused freshly generated access generation %j before recovery secrets",
    async (generatedId) => {
      const ctx = createContext();
      vi.mocked(ctx.ports.ids.generateId).mockResolvedValueOnce(generatedId);

      await expect(
        ctx.useCase.execute({
          vaultId: ctx.values.vaultId,
          recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
          newMasterPassword: ctx.values.newMasterPassword,
        }),
      ).rejects.toBeInstanceOf(DeviceAccessMaterialChangedError);

      expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    { recordKind: "material", revision: Number.MAX_SAFE_INTEGER },
    { recordKind: "backup", revision: Number.MAX_SAFE_INTEGER },
    { recordKind: "material", revision: null as unknown as number },
    { recordKind: "backup", revision: null as unknown as number },
  ] as const)(
    "rejects an invalid or exhausted $recordKind revision before processing recovery secrets",
    async ({ recordKind, revision }) => {
      const ctx = createContext();

      if (recordKind === "material") {
        ctx.saved.deviceAccessMaterial = {
          ...ctx.deviceAccessMaterial,
          revision,
        };
      } else {
        ctx.saved.deviceAccessRecoveryBackup = {
          ...ctx.backup,
          revision,
        };
      }

      const materialChange = ctx.useCase
        .execute({
          vaultId: ctx.values.vaultId,
          recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
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
      expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
      expect(ctx.ports.crypto.unwrapLocalKeysPayload).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
      ).not.toHaveBeenCalled();
    },
  );

  it("rotates the generation when material is absent and rejects a stale save", async () => {
    const ctx = createContext();
    const staleDeviceAccessMaterial = ctx.deviceAccessMaterial;
    ctx.saved.deviceAccessMaterial = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).resolves.toMatchObject({ deviceId: ctx.values.deviceId });

    const recoveredDeviceAccessMaterial = ctx.saved.deviceAccessMaterial;
    expect(recoveredDeviceAccessMaterial).toMatchObject({
      revision: 1,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    });
    expect(ctx.saved.deviceAccessRecoveryBackup).toMatchObject({
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    });
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDeviceAccessMaterialRevision: null,
        expectedDeviceAccessMaterialGenerationId: null,
        expectedDeviceAccessRecoveryBackupGenerationId:
          ctx.values.localAccessGenerationId,
      }),
    );

    const staleSave = ctx.ports.vaultLocalRepository
      .saveDeviceAccessRecords({
        expectedDeviceAccessMaterialRevision:
          staleDeviceAccessMaterial.revision,
        expectedDeviceAccessMaterialGenerationId:
          staleDeviceAccessMaterial.localAccessGenerationId,
        expectedDeviceAccessRecoveryBackupRevision: ctx.backup.revision,
        expectedDeviceAccessRecoveryBackupGenerationId:
          ctx.backup.localAccessGenerationId,
        deviceAccessMaterial: {
          ...staleDeviceAccessMaterial,
          revision: staleDeviceAccessMaterial.revision + 1,
          localAccessGenerationId:
            ctx.values.replacementLocalAccessGenerationId,
        },
        deviceAccessRecoveryBackup: {
          ...ctx.backup,
          revision: ctx.backup.revision + 1,
          localAccessGenerationId:
            ctx.values.replacementLocalAccessGenerationId,
        },
      })
      .catch((caught: unknown) => caught);
    expectSecretSafeDeviceAccessMaterialChange({
      error: await staleSave,
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
      recoveredDeviceAccessMaterial,
    );
  });

  it("does not overwrite a concurrent password change or partially rotate recovery", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = {
      sessionId: ctx.values.sessionId,
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vault: ctx.values.decryptedVault,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
        devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
        deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
        trustedSnapshotContext: {
          snapshotDigest: ctx.values.vaultSnapshotDigest,
          trust: ctx.values.verifiedVaultTrustState,
        },
        vaultTrustAnchor: ctx.values.vaultTrustAnchor,
      },
      sourceSnapshotVersionVector: { [ctx.values.deviceId]: 1 },
    };
    vi.mocked(ctx.ports.crypto.generateMasterPasswordSalt).mockResolvedValue(
      ctx.values.newMasterPasswordSalt,
    );
    vi.mocked(
      ctx.ports.crypto.generateLocalKeysProtectionSalt,
    ).mockResolvedValue(ctx.values.newLocalKeysProtectionSalt);
    const { continueRecoveryWrapping, recoveryWrappingStarted } =
      deferRecoveryReplacement(ctx);

    const recovery = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await recoveryWrappingStarted;

    const changeMasterPassword = new ChangeMasterPasswordUseCase(
      ctx.ports.crypto,
      ctx.ports.vaultLocalRepository,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.ports.ids,
    );
    await changeMasterPassword.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    const passwordChangedMaterial = {
      ...ctx.deviceAccessMaterial,
      revision: ctx.deviceAccessMaterial.revision + 1,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
      masterPasswordSalt: ctx.values.newMasterPasswordSalt,
      localKeysProtectionSalt: ctx.values.newLocalKeysProtectionSalt,
      protectedLocalKeys: ctx.values.reprotectedLocalKeys,
    };
    expect(ctx.saved.deviceAccessMaterial).toEqual(passwordChangedMaterial);
    const passwordChangedBackup = {
      ...ctx.backup,
      revision: ctx.backup.revision + 1,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    };
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(passwordChangedBackup);

    const materialChange = recovery.catch((caught: unknown) => caught);
    continueRecoveryWrapping();
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

    expect(ctx.saved.deviceAccessMaterial).toEqual(passwordChangedMaterial);
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(passwordChangedBackup);
  });

  it("does not overwrite a concurrently replaced recovery backup", async () => {
    const ctx = createContext();
    const originalDeviceAccessMaterial = ctx.saved.deviceAccessMaterial;
    const { continueRecoveryWrapping, recoveryWrappingStarted } =
      deferRecoveryReplacement(ctx);
    const recovery = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await recoveryWrappingStarted;

    const concurrentlyReplacedBackup: DeviceAccessRecoveryBackup = {
      ...ctx.backup,
      revision: ctx.backup.revision + 1,
      recoveryLocalKeysProtectionSalt:
        ctx.values.rotatedRecoveryLocalKeysProtectionSalt,
      protectedLocalKeys: ctx.values.rotatedRecoveryProtectedLocalKeys,
    };
    ctx.saved.deviceAccessRecoveryBackup = concurrentlyReplacedBackup;

    const materialChange = recovery.catch((caught: unknown) => caught);
    continueRecoveryWrapping();
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

  it("does not accept reset revisions from a replayed enrollment", async () => {
    const ctx = createContext();
    const { continueRecoveryWrapping, recoveryWrappingStarted } =
      deferRecoveryReplacement(ctx);
    const recovery = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await recoveryWrappingStarted;

    const reEnrolledDeviceAccessMaterial = {
      ...ctx.deviceAccessMaterial,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    };
    const reEnrolledRecoveryBackup: DeviceAccessRecoveryBackup = {
      ...ctx.backup,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    };
    ctx.saved.deviceAccessMaterial = reEnrolledDeviceAccessMaterial;
    ctx.saved.deviceAccessRecoveryBackup = reEnrolledRecoveryBackup;

    const materialChange = recovery.catch((caught: unknown) => caught);
    continueRecoveryWrapping();
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
      reEnrolledDeviceAccessMaterial,
    );
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(
      reEnrolledRecoveryBackup,
    );
  });

  it.each([
    "vaultId",
    "deviceId",
    "algorithmSuiteId",
    "devicePublicSignKey",
    "devicePublicVaultKey",
  ] as const)(
    "atomically rejects replacement records with different %s values",
    async (identityField) => {
      const ctx = createContext();
      const originalDeviceAccessMaterial = ctx.saved.deviceAccessMaterial;
      const mismatchedRecoveryBackup: DeviceAccessRecoveryBackup = {
        ...ctx.backup,
        revision: ctx.backup.revision + 1,
        localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
        vaultId:
          identityField === "vaultId"
            ? "different-vault-id"
            : ctx.backup.vaultId,
        deviceId:
          identityField === "deviceId"
            ? ctx.values.pendingDeviceId
            : ctx.backup.deviceId,
        algorithmSuiteId:
          identityField === "algorithmSuiteId"
            ? "spm-unsupported"
            : ctx.backup.algorithmSuiteId,
        devicePublicSignKey:
          identityField === "devicePublicSignKey"
            ? (new Uint8Array([1])
                .buffer as typeof ctx.values.devicePublicSignKey)
            : ctx.backup.devicePublicSignKey,
        devicePublicVaultKey:
          identityField === "devicePublicVaultKey"
            ? (new Uint8Array([3])
                .buffer as typeof ctx.values.devicePublicVaultKey)
            : ctx.backup.devicePublicVaultKey,
      };

      const materialChange = ctx.ports.vaultLocalRepository
        .saveDeviceAccessRecords({
          expectedDeviceAccessMaterialRevision:
            ctx.deviceAccessMaterial.revision,
          expectedDeviceAccessMaterialGenerationId:
            ctx.deviceAccessMaterial.localAccessGenerationId,
          expectedDeviceAccessRecoveryBackupRevision: ctx.backup.revision,
          expectedDeviceAccessRecoveryBackupGenerationId:
            ctx.backup.localAccessGenerationId,
          deviceAccessMaterial: {
            ...ctx.deviceAccessMaterial,
            revision: ctx.deviceAccessMaterial.revision + 1,
            localAccessGenerationId:
              ctx.values.replacementLocalAccessGenerationId,
          },
          deviceAccessRecoveryBackup: mismatchedRecoveryBackup,
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
      expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(ctx.backup);
    },
  );

  it("atomically rejects split-null expectations for malformed present material", async () => {
    const ctx = createContext();
    const malformedDeviceAccessMaterial = {
      ...ctx.deviceAccessMaterial,
      revision: null as unknown as number,
    };
    ctx.saved.deviceAccessMaterial = malformedDeviceAccessMaterial;
    const malformedSave = {
      expectedDeviceAccessMaterialRevision: null,
      expectedDeviceAccessMaterialGenerationId:
        malformedDeviceAccessMaterial.localAccessGenerationId,
      expectedDeviceAccessRecoveryBackupRevision: ctx.backup.revision,
      expectedDeviceAccessRecoveryBackupGenerationId:
        ctx.backup.localAccessGenerationId,
      deviceAccessMaterial: {
        ...ctx.deviceAccessMaterial,
        revision: 1,
        localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
      },
      deviceAccessRecoveryBackup: {
        ...ctx.backup,
        revision: ctx.backup.revision + 1,
        localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
      },
    } as unknown as Parameters<
      typeof ctx.ports.vaultLocalRepository.saveDeviceAccessRecords
    >[0];

    const materialChange = ctx.ports.vaultLocalRepository
      .saveDeviceAccessRecords(malformedSave)
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
      malformedDeviceAccessMaterial,
    );
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(ctx.backup);
  });

  it.each([
    {
      expectedDeviceAccessMaterialRevision: null,
      expectedDeviceAccessMaterialGenerationId: "local-access-generation-id",
    },
    {
      expectedDeviceAccessMaterialRevision: 1,
      expectedDeviceAccessMaterialGenerationId: null,
    },
  ] as const)(
    "atomically rejects split-null absent-material expectations %#",
    async ({
      expectedDeviceAccessMaterialRevision,
      expectedDeviceAccessMaterialGenerationId,
    }) => {
      const ctx = createContext();
      ctx.saved.deviceAccessMaterial = undefined;
      const malformedSave = {
        expectedDeviceAccessMaterialRevision,
        expectedDeviceAccessMaterialGenerationId,
        expectedDeviceAccessRecoveryBackupRevision: ctx.backup.revision,
        expectedDeviceAccessRecoveryBackupGenerationId:
          ctx.backup.localAccessGenerationId,
        deviceAccessMaterial: {
          ...ctx.deviceAccessMaterial,
          revision: 1,
          localAccessGenerationId:
            ctx.values.replacementLocalAccessGenerationId,
        },
        deviceAccessRecoveryBackup: {
          ...ctx.backup,
          revision: ctx.backup.revision + 1,
          localAccessGenerationId:
            ctx.values.replacementLocalAccessGenerationId,
        },
      } as unknown as Parameters<
        typeof ctx.ports.vaultLocalRepository.saveDeviceAccessRecords
      >[0];

      const materialChange = ctx.ports.vaultLocalRepository
        .saveDeviceAccessRecords(malformedSave)
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
      expect(ctx.saved.deviceAccessMaterial).toBeUndefined();
      expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(ctx.backup);
    },
  );

  it.each([
    "vaultId",
    "deviceId",
    "algorithmSuiteId",
    "devicePublicSignKey",
    "devicePublicVaultKey",
  ] as const)(
    "atomically preserves the persisted backup when absent-material replacements change %s",
    async (identityField) => {
      const ctx = createContext();
      ctx.saved.deviceAccessMaterial = undefined;
      const replacementPublicSignKey = new Uint8Array([1])
        .buffer as typeof ctx.values.devicePublicSignKey;
      const replacementPublicVaultKey = new Uint8Array([3])
        .buffer as typeof ctx.values.devicePublicVaultKey;
      const replacementIdentity = {
        vaultId:
          identityField === "vaultId"
            ? "different-vault-id"
            : ctx.values.vaultId,
        deviceId:
          identityField === "deviceId"
            ? ctx.values.pendingDeviceId
            : ctx.values.deviceId,
        algorithmSuiteId:
          identityField === "algorithmSuiteId"
            ? "spm-unsupported"
            : ctx.backup.algorithmSuiteId,
        devicePublicSignKey:
          identityField === "devicePublicSignKey"
            ? replacementPublicSignKey
            : ctx.values.devicePublicSignKey,
        devicePublicVaultKey:
          identityField === "devicePublicVaultKey"
            ? replacementPublicVaultKey
            : ctx.values.devicePublicVaultKey,
      };

      const materialChange = ctx.ports.vaultLocalRepository
        .saveDeviceAccessRecords({
          expectedDeviceAccessMaterialRevision: null,
          expectedDeviceAccessMaterialGenerationId: null,
          expectedDeviceAccessRecoveryBackupRevision: ctx.backup.revision,
          expectedDeviceAccessRecoveryBackupGenerationId:
            ctx.backup.localAccessGenerationId,
          deviceAccessMaterial: {
            ...ctx.deviceAccessMaterial,
            ...replacementIdentity,
            revision: 1,
            localAccessGenerationId:
              ctx.values.replacementLocalAccessGenerationId,
          },
          deviceAccessRecoveryBackup: {
            ...ctx.backup,
            ...replacementIdentity,
            revision: ctx.backup.revision + 1,
            localAccessGenerationId:
              ctx.values.replacementLocalAccessGenerationId,
          },
        })
        .catch((caught: unknown) => caught);
      const error = await materialChange;

      expect(error).toBeInstanceOf(DeviceAccessMaterialChangedError);

      if (!(error instanceof Error)) {
        throw new Error("Expected a device access material conflict.");
      }

      expect(error.cause).toBeUndefined();
      expectErrorDoesNotContainSecrets({
        error,
        stringSecrets: [
          ctx.values.masterPassword,
          ctx.values.newMasterPassword,
        ],
        objectSecrets: [
          ctx.values.devicePublicSignKey,
          ctx.values.devicePrivateSignKey,
          ctx.values.devicePublicVaultKey,
          ctx.values.devicePrivateVaultKey,
        ],
      });
      expect(ctx.saved.deviceAccessMaterial).toBeUndefined();
      expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(ctx.backup);
    },
  );

  it("atomically rejects persisted records from different generations", async () => {
    const ctx = createContext();
    const newerDeviceAccessMaterial = {
      ...ctx.deviceAccessMaterial,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    };
    ctx.saved.deviceAccessMaterial = newerDeviceAccessMaterial;

    const materialChange = ctx.ports.vaultLocalRepository
      .saveDeviceAccessRecords({
        expectedDeviceAccessMaterialRevision:
          newerDeviceAccessMaterial.revision,
        expectedDeviceAccessMaterialGenerationId:
          newerDeviceAccessMaterial.localAccessGenerationId,
        expectedDeviceAccessRecoveryBackupRevision: ctx.backup.revision,
        expectedDeviceAccessRecoveryBackupGenerationId:
          ctx.backup.localAccessGenerationId,
        deviceAccessMaterial: {
          ...newerDeviceAccessMaterial,
          revision: newerDeviceAccessMaterial.revision + 1,
        },
        deviceAccessRecoveryBackup: {
          ...ctx.backup,
          revision: ctx.backup.revision + 1,
          localAccessGenerationId:
            newerDeviceAccessMaterial.localAccessGenerationId,
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
    expect(ctx.saved.deviceAccessMaterial).toEqual(newerDeviceAccessMaterial);
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(ctx.backup);
  });

  it.each(["material", "backup"] as const)(
    "atomically rejects a recovered %s revision that is not the exact successor",
    async (recordKind) => {
      const ctx = createContext();
      const originalDeviceAccessMaterial = ctx.saved.deviceAccessMaterial;
      const replacementMaterialRevision =
        ctx.deviceAccessMaterial.revision + (recordKind === "material" ? 2 : 1);
      const replacementBackupRevision =
        ctx.backup.revision + (recordKind === "backup" ? 2 : 1);

      const materialChange = ctx.ports.vaultLocalRepository
        .saveDeviceAccessRecords({
          expectedDeviceAccessMaterialRevision:
            ctx.deviceAccessMaterial.revision,
          expectedDeviceAccessMaterialGenerationId:
            ctx.deviceAccessMaterial.localAccessGenerationId,
          expectedDeviceAccessRecoveryBackupRevision: ctx.backup.revision,
          expectedDeviceAccessRecoveryBackupGenerationId:
            ctx.backup.localAccessGenerationId,
          deviceAccessMaterial: {
            ...ctx.deviceAccessMaterial,
            revision: replacementMaterialRevision,
            localAccessGenerationId:
              ctx.values.replacementLocalAccessGenerationId,
          },
          deviceAccessRecoveryBackup: {
            ...ctx.backup,
            revision: replacementBackupRevision,
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
      expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(ctx.backup);
    },
  );

  it("atomically rejects absent-material expectations while material exists", async () => {
    const ctx = createContext();
    const originalDeviceAccessMaterial = ctx.saved.deviceAccessMaterial;

    const materialChange = ctx.ports.vaultLocalRepository
      .saveDeviceAccessRecords({
        expectedDeviceAccessMaterialRevision: null,
        expectedDeviceAccessMaterialGenerationId: null,
        expectedDeviceAccessRecoveryBackupRevision: ctx.backup.revision,
        expectedDeviceAccessRecoveryBackupGenerationId:
          ctx.backup.localAccessGenerationId,
        deviceAccessMaterial: {
          ...ctx.deviceAccessMaterial,
          revision: 1,
          localAccessGenerationId:
            ctx.values.replacementLocalAccessGenerationId,
        },
        deviceAccessRecoveryBackup: {
          ...ctx.backup,
          revision: ctx.backup.revision + 1,
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
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(ctx.backup);
  });

  it("cannot recover a device removed from the current snapshot", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      keySlots: { deviceSlots: [] },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotNotFoundError);
  });

  it("rejects a recovered wrapping private key that does not match local identity", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.verifyDeviceVaultKeyPair).mockResolvedValue(
      false,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotVerificationFailedError);

    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).not.toHaveBeenCalled();
  });
});
