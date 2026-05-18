import { describe, expect, it, vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { LocalKeysPayload } from "../../domain/local-protection/local-protection.type";
import type { Vault } from "../../domain/vault/vault";
import { createInitializeVaultTestContext } from "../../__tests__/fixtures/initialize-vault";

describe("InitializeVaultUseCase", () => {
  it("initializes an empty vault and persists local, snapshot, and unlocked state", async () => {
    const ctx = createInitializeVaultTestContext();

    const result = await ctx.useCase.execute({
      masterPassword: ctx.values.masterPassword,
      deviceName: "Work laptop",
    });

    expect(result).toEqual({
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      vaultDisplayName: ctx.values.vaultDisplayName,
    });

    expect(ctx.ports.ids.generateId).toHaveBeenCalledTimes(2);
    expect(ctx.ports.clock.now).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.vaultDisplayName.generateVaultDisplayName,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.bip39.recoveryKeyToMnemonic).toHaveBeenCalledWith(
      ctx.values.recoverySecretKey,
    );
    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenCalledWith(
      ctx.values.masterPassword,
      ctx.values.masterPasswordSalt,
    );
    expect(ctx.ports.crypto.deriveLocalKeysProtectionKey).toHaveBeenCalledWith(
      ctx.values.localRootKey,
      ctx.values.localKeysProtectionSalt,
    );

    const expectedLocalKeysPayload: LocalKeysPayload = {
      deviceSlotKey: ctx.values.deviceSlotKey,
      devicePrivateSignKey: ctx.values.devicePrivateSignKey,
    };

    expect(ctx.ports.crypto.wrapLocalKeysPayload).toHaveBeenCalledWith(
      expectedLocalKeysPayload,
      ctx.values.localKeysProtectionKey,
    );
    expect(
      ctx.ports.crypto.deriveDeviceSlotVaultMasterKeyProtectionKey,
    ).toHaveBeenCalledWith(ctx.values.deviceSlotKey);
    expect(
      ctx.ports.crypto.deriveRecoveryVaultMasterKeyProtectionKey,
    ).toHaveBeenCalledWith(ctx.values.recoverySecretKey);
    expect(ctx.ports.crypto.wrapVaultMasterKey).toHaveBeenNthCalledWith(
      1,
      ctx.values.vaultMasterKey,
      ctx.values.deviceSlotVaultMasterKeyProtectionKey,
    );
    expect(ctx.ports.crypto.wrapVaultMasterKey).toHaveBeenNthCalledWith(
      2,
      ctx.values.vaultMasterKey,
      ctx.values.recoveryVaultMasterKeyProtectionKey,
    );

    const expectedVault: Vault = {
      entries: [],
      registeredDevices: [
        {
          id: ctx.values.deviceId,
          name: "Work laptop",
          createdAt: new Date(ctx.values.timestamp),
          publicKeys: {
            signingKey: ctx.values.devicePublicSignKey,
          },
        },
      ],
      tags: [],
    };

    const expectedTrustedDevices = [
      {
        id: ctx.values.deviceId,
        publicKeys: {
          signingKey: ctx.values.devicePublicSignKey,
        },
      },
    ];

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).toHaveBeenCalledWith(
      expectedVault,
      ctx.values.vaultMasterKey,
    );

    expect(ctx.saved.localVaultDescriptor).toEqual({
      vaultId: ctx.values.vaultId,
      displayName: ctx.values.vaultDisplayName,
      createdAt: ctx.values.timestamp,
    });

    expect(ctx.saved.deviceAccessMaterial).toEqual({
      vaultId: ctx.values.vaultId,
      deviceId: ctx.values.deviceId,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      masterPasswordSalt: ctx.values.masterPasswordSalt,
      localKeysProtectionSalt: ctx.values.localKeysProtectionSalt,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      protectedLocalKeys: ctx.values.protectedLocalKeys,
    });

    expect(ctx.saved.vaultSnapshot).toEqual({
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp,
        revisionTimestamp: ctx.values.timestamp,
        revision: 1,
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: ctx.values.deviceId,
      },
      trustedDevices: expectedTrustedDevices,
      keySlots: {
        deviceSlots: [
          {
            deviceId: ctx.values.deviceId,
            protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
          },
        ],
        recoveryKeySlot: {
          protectedVaultMasterKey: ctx.values.protectedRecoveryVaultMasterKey,
        },
      },
      content: ctx.values.encryptedVault,
      signature: ctx.values.snapshotSignature,
    });

    expect(ctx.ports.crypto.signVaultSnapshot).toHaveBeenCalledWith(
      {
        metadata: ctx.saved.vaultSnapshot?.metadata,
        trustedDevices: ctx.saved.vaultSnapshot?.trustedDevices,
        keySlots: ctx.saved.vaultSnapshot?.keySlots,
        content: ctx.saved.vaultSnapshot?.content,
      },
      ctx.values.devicePrivateSignKey,
    );

    expect(ctx.saved.unlockedVault).toEqual({
      vaultId: ctx.values.vaultId,
      deviceId: ctx.values.deviceId,
      vault: expectedVault,
      vaultMasterKey: ctx.values.vaultMasterKey,
      devicePrivateSignKey: ctx.values.devicePrivateSignKey,
    });
  });

  it("bubbles local initialization errors and does not save unlocked state", async () => {
    const ctx = createInitializeVaultTestContext();
    const error = new Error("local initialization failed");

    vi.mocked(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        masterPassword: ctx.values.masterPassword,
        deviceName: "Work laptop",
      }),
    ).rejects.toThrow(error);

    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveLocalVaultDescriptor,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });
});
