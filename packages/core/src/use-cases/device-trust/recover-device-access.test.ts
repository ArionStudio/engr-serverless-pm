import { describe, expect, it, vi } from "vitest";
import { expectSecretSafeDeviceAccessMaterialChange } from "../../__tests__/fixtures/device-access-errors";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust";
import type { RawMasterPassword } from "../../domain/master-password";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
import {
  DeviceKeySlotNotFoundError,
  DeviceKeySlotVerificationFailedError,
} from "../../errors/unlock-vault.errors";
import { ChangeMasterPasswordUseCase } from "../vault-lifecycle/change-master-password";
import { RecoverDeviceAccessUseCase } from "./recover-device-access";

function createContext() {
  const ctx = createUnlockVaultTestContext();
  vi.mocked(ctx.ports.ids.generateId).mockReset();
  vi.mocked(ctx.ports.ids.generateId).mockResolvedValue(
    ctx.values.replacementLocalAccessGenerationId,
  );
  const backup: DeviceAccessRecoveryBackup = {
    revision: 1,
    localAccessGenerationId: ctx.values.localAccessGenerationId,
    vaultId: ctx.values.vaultId,
    deviceId: ctx.values.deviceId,
    algorithmSuiteId: ctx.ports.crypto.algorithmSuite.id,
    recoveryLocalKeysProtectionSalt: ctx.values.recoveryLocalKeysProtectionSalt,
    devicePublicSignKey: ctx.values.devicePublicSignKey,
    devicePublicVaultKey: ctx.values.devicePublicVaultKey,
    protectedLocalKeys: ctx.values.recoveryProtectedLocalKeys,
  };
  ctx.saved.deviceAccessRecoveryBackup = backup;
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
  wrapLocalKeysPayload.mockImplementation(async (payload, protectionKey) => {
    if (protectionKey === ctx.values.rotatedRecoveryLocalKeysProtectionKey) {
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
      ctx.ports.vaultLocalRepository.getDeviceAccessRecoveryBackup,
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

  it("recovers the wrapping key and re-protects the complete local identity", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    expect(ctx.ports.crypto.verifyDeviceVaultKeyPair).toHaveBeenCalledWith(
      ctx.values.devicePublicVaultKey,
      ctx.values.devicePrivateVaultKey,
    );
    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).toHaveBeenCalled();
    expect(ctx.saved.deviceAccessMaterial).toMatchObject({
      revision: ctx.deviceAccessMaterial.revision + 1,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      devicePublicVaultKey: ctx.values.devicePublicVaultKey,
    });
    expect(ctx.saved.deviceAccessRecoveryBackup).toMatchObject({
      revision: ctx.backup.revision + 1,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    });
  });

  it("rejects the old backup after a successful recovery rotation", async () => {
    const ctx = createContext();
    const replayedRecoveryBackup = ctx.backup;

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    const recoveredDeviceAccessMaterial = ctx.saved.deviceAccessMaterial;
    const rotatedRecoveryBackup = ctx.saved.deviceAccessRecoveryBackup;
    expect(recoveredDeviceAccessMaterial).toMatchObject({
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    });
    expect(rotatedRecoveryBackup).toMatchObject({
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
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.saved.deviceAccessMaterial).toEqual(
      recoveredDeviceAccessMaterial,
    );
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(
      replayedRecoveryBackup,
    );
  });

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
        ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
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
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDeviceAccessMaterialRevision: null,
        expectedDeviceAccessMaterialGenerationId: null,
        expectedDeviceAccessRecoveryBackupGenerationId:
          ctx.values.localAccessGenerationId,
      }),
    );

    const staleSave = ctx.ports.vaultLocalRepository
      .saveDeviceAccessMaterial({
        expectedDeviceAccessMaterialRevision:
          staleDeviceAccessMaterial.revision,
        expectedLocalAccessGenerationId:
          staleDeviceAccessMaterial.localAccessGenerationId,
        deviceAccessMaterial: {
          ...staleDeviceAccessMaterial,
          revision: staleDeviceAccessMaterial.revision + 1,
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
    );
    await changeMasterPassword.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    const passwordChangedMaterial = {
      ...ctx.deviceAccessMaterial,
      revision: ctx.deviceAccessMaterial.revision + 1,
      masterPasswordSalt: ctx.values.newMasterPasswordSalt,
      localKeysProtectionSalt: ctx.values.newLocalKeysProtectionSalt,
      protectedLocalKeys: ctx.values.reprotectedLocalKeys,
    };
    expect(ctx.saved.deviceAccessMaterial).toEqual(passwordChangedMaterial);

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
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(ctx.backup);
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

  it.each(["vaultId", "deviceId"] as const)(
    "atomically rejects replacement records with different %s values",
    async (identityField) => {
      const ctx = createContext();
      const originalDeviceAccessMaterial = ctx.saved.deviceAccessMaterial;
      const mismatchedRecoveryBackup: DeviceAccessRecoveryBackup = {
        ...ctx.backup,
        [identityField]:
          identityField === "vaultId"
            ? "different-vault-id"
            : ctx.values.pendingDeviceId,
      };
      ctx.saved.deviceAccessRecoveryBackup = mismatchedRecoveryBackup;

      const materialChange = ctx.ports.vaultLocalRepository
        .saveRecoveredDeviceAccess({
          expectedDeviceAccessMaterialRevision:
            ctx.deviceAccessMaterial.revision,
          expectedDeviceAccessMaterialGenerationId:
            ctx.deviceAccessMaterial.localAccessGenerationId,
          expectedDeviceAccessRecoveryBackupRevision:
            mismatchedRecoveryBackup.revision,
          expectedDeviceAccessRecoveryBackupGenerationId:
            mismatchedRecoveryBackup.localAccessGenerationId,
          deviceAccessMaterial: {
            ...ctx.deviceAccessMaterial,
            revision: ctx.deviceAccessMaterial.revision + 1,
          },
          deviceAccessRecoveryBackup: {
            ...mismatchedRecoveryBackup,
            revision: mismatchedRecoveryBackup.revision + 1,
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
      expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(
        mismatchedRecoveryBackup,
      );
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
      .saveRecoveredDeviceAccess({
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
    expect(ctx.saved.deviceAccessMaterial).toEqual(
      newerDeviceAccessMaterial,
    );
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
        .saveRecoveredDeviceAccess({
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
      .saveRecoveredDeviceAccess({
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
