import { describe, expect, it, vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { DeviceAccessMaterial } from "../../domain/device/device-access-material";
import type { LocalKeysPayload } from "../../domain/local-protection/local-protection.type";
import type { Vault } from "../../domain/vault/vault";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { UnsupportedAlgorithmSuiteError } from "../../application/errors/algorithm-suite.errors";
import { ActiveUnlockedVaultMismatchError } from "../../application/errors/vault-session.errors";
import {
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../application/errors/unlock-vault.errors";
import { RecoverVaultAccessUseCase } from "./recover-vault-access";

const recoveredDeviceId = "recovered-device-id";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  vi.mocked(ports.ids.generateId).mockReset();
  vi.mocked(ports.ids.generateId)
    .mockResolvedValueOnce(recoveredDeviceId)
    .mockResolvedValue(values.sessionId);
  vi.mocked(ports.crypto.generateMasterPasswordSalt)
    .mockReset()
    .mockResolvedValue(values.newMasterPasswordSalt);
  vi.mocked(ports.crypto.generateLocalKeysProtectionSalt)
    .mockReset()
    .mockResolvedValue(values.newLocalKeysProtectionSalt);
  vi.mocked(ports.crypto.deriveLocalRootKey)
    .mockReset()
    .mockResolvedValue(values.newLocalRootKey);
  vi.mocked(ports.crypto.deriveLocalKeysProtectionKey)
    .mockReset()
    .mockResolvedValue(values.newLocalKeysProtectionKey);

  const vaultSnapshot: VaultSnapshot = {
    metadata: {
      id: values.vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: values.timestamp - 1,
      revisionTimestamp: values.timestamp - 1,
      revision: 1,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      createdByDeviceId: values.deviceId,
    },
    trustedDevices: [
      {
        id: values.deviceId,
        publicKeys: {
          signingKey: values.devicePublicSignKey,
        },
      },
    ],
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
        },
      ],
      recoveryKeySlot: {
        protectedVaultMasterKey: values.protectedRecoveryVaultMasterKey,
      },
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };

  ports.saved.vaultSnapshot = vaultSnapshot;

  return {
    values,
    ports,
    saved: ports.saved,
    vaultSnapshot,
    useCase: new RecoverVaultAccessUseCase(
      ports.bip39,
      ports.clock,
      ports.crypto,
      ports.ids,
      ports.sessionServices.unlockedVaultSession,
      ports.vaultLocalRepository,
    ),
  };
}

describe("RecoverVaultAccessUseCase", () => {
  it("recovers vault access by creating fresh local device material", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
      deviceName: "Recovered laptop",
    });

    const recoveredVault: Vault = {
      ...ctx.values.decryptedVault,
      versionVector: {
        ...ctx.values.decryptedVault.versionVector,
        [recoveredDeviceId]: 1,
      },
      deviceProfiles: [
        {
          id: recoveredDeviceId,
          name: "Recovered laptop",
          createdAt: ctx.values.timestamp,
          versionVector: {
            [recoveredDeviceId]: 1,
          },
        },
      ],
    };

    expect(result).toEqual({
      vault: recoveredVault,
    });
    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(ctx.ports.crypto.verifyVaultSnapshotSignature).toHaveBeenCalledWith(
      ctx.vaultSnapshot,
      ctx.values.devicePublicSignKey,
    );
    expect(ctx.ports.bip39.mnemonicToRecoveryKey).toHaveBeenCalledWith(
      ctx.values.recoveryMnemonicKey,
    );
    expect(
      ctx.ports.crypto.deriveRecoveryVaultMasterKeyProtectionKey,
    ).toHaveBeenCalledWith(ctx.values.recoverySecretKey);
    expect(ctx.ports.crypto.unwrapVaultMasterKey).toHaveBeenCalledWith(
      ctx.values.protectedRecoveryVaultMasterKey,
      ctx.values.recoveryVaultMasterKeyProtectionKey,
    );
    expect(ctx.ports.crypto.decryptVaultSnapshotContent).toHaveBeenCalledWith(
      ctx.values.encryptedVault,
      ctx.values.vaultMasterKey,
    );
    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenCalledWith(
      ctx.values.newMasterPassword,
      ctx.values.newMasterPasswordSalt,
    );
    expect(ctx.ports.crypto.deriveLocalKeysProtectionKey).toHaveBeenCalledWith(
      ctx.values.newLocalRootKey,
      ctx.values.newLocalKeysProtectionSalt,
    );

    const expectedLocalKeysPayload: LocalKeysPayload = {
      deviceSlotKey: ctx.values.deviceSlotKey,
      devicePrivateSignKey: ctx.values.devicePrivateSignKey,
    };

    expect(ctx.ports.crypto.wrapLocalKeysPayload).toHaveBeenCalledWith(
      expectedLocalKeysPayload,
      ctx.values.newLocalKeysProtectionKey,
    );
    expect(
      ctx.ports.crypto.deriveDeviceSlotVaultMasterKeyProtectionKey,
    ).toHaveBeenCalledWith(ctx.values.deviceSlotKey);
    expect(ctx.ports.crypto.wrapVaultMasterKey).toHaveBeenCalledWith(
      ctx.values.vaultMasterKey,
      ctx.values.deviceSlotVaultMasterKeyProtectionKey,
    );
    expect(ctx.ports.crypto.encryptVaultSnapshotContent).toHaveBeenCalledWith(
      recoveredVault,
      ctx.values.vaultMasterKey,
    );

    expect(ctx.saved.deviceAccessMaterial).toEqual({
      vaultId: ctx.values.vaultId,
      deviceId: recoveredDeviceId,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      masterPasswordSalt: ctx.values.newMasterPasswordSalt,
      localKeysProtectionSalt: ctx.values.newLocalKeysProtectionSalt,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      protectedLocalKeys: ctx.values.reprotectedLocalKeys,
    });

    expect(ctx.saved.vaultSnapshot).toEqual({
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        revision: 2,
        revisionTimestamp: ctx.values.timestamp,
        createdByDeviceId: recoveredDeviceId,
      },
      trustedDevices: [
        ...ctx.vaultSnapshot.trustedDevices,
        {
          id: recoveredDeviceId,
          publicKeys: {
            signingKey: ctx.values.devicePublicSignKey,
          },
        },
      ],
      keySlots: {
        deviceSlots: [
          ...ctx.vaultSnapshot.keySlots.deviceSlots,
          {
            deviceId: recoveredDeviceId,
            protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
          },
        ],
        recoveryKeySlot: ctx.vaultSnapshot.keySlots.recoveryKeySlot,
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
    expect(ctx.saved.unlockedVaultSession).toEqual({
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: recoveredDeviceId,
        vault: recoveredVault,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      },
      sourceSnapshotRevision: 2,
    });
    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredLocalVault,
    ).toHaveBeenCalledWith(
      ctx.saved.deviceAccessMaterial,
      ctx.saved.vaultSnapshot,
    );
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
    expect(
      vi.mocked(ctx.ports.vaultLocalRepository.saveRecoveredLocalVault).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.sessionServices.unlockedVaultSession.commit).mock
        .invocationCallOrder[0],
    );
  });

  it("replaces the known local device identity when recovering access", async () => {
    const ctx = createContext();
    const deviceAccessMaterial: DeviceAccessMaterial = {
      vaultId: ctx.values.vaultId,
      deviceId: ctx.values.deviceId,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      masterPasswordSalt: ctx.values.masterPasswordSalt,
      localKeysProtectionSalt: ctx.values.localKeysProtectionSalt,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      protectedLocalKeys: ctx.values.protectedLocalKeys,
    };
    const vaultWithDeviceProfile: Vault = {
      ...ctx.values.decryptedVault,
      deviceProfiles: [
        {
          id: ctx.values.deviceId,
          name: "Old laptop",
          createdAt: ctx.values.timestamp - 1,
          versionVector: {
            [ctx.values.deviceId]: 1,
          },
        },
      ],
    };
    ctx.saved.deviceAccessMaterial = deviceAccessMaterial;
    vi.mocked(
      ctx.ports.crypto.decryptVaultSnapshotContent,
    ).mockResolvedValueOnce(vaultWithDeviceProfile);

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
      deviceName: "Recovered laptop",
    });

    expect(ctx.saved.vaultSnapshot?.trustedDevices).toEqual([
      {
        id: recoveredDeviceId,
        publicKeys: {
          signingKey: ctx.values.devicePublicSignKey,
        },
      },
    ]);
    expect(ctx.saved.vaultSnapshot?.keySlots.deviceSlots).toEqual([
      {
        deviceId: recoveredDeviceId,
        protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
      },
    ]);
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.deviceProfiles.map(
        (deviceProfile) => deviceProfile.id,
      ),
    ).toEqual([recoveredDeviceId]);
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.deletedDeviceProfiles,
    ).toEqual([
      {
        id: ctx.values.deviceId,
        versionVector: {
          [ctx.values.deviceId]: 1,
          [recoveredDeviceId]: 1,
        },
        deletedAt: ctx.values.timestamp,
      },
    ]);
  });

  it("fails when vault snapshot is missing", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
        deviceName: "Recovered laptop",
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotNotFoundError);

    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when vault snapshot uses unsupported algorithm suite", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        algorithmSuiteId: "spm-unsupported",
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
        deviceName: "Recovered laptop",
      }),
    ).rejects.toBeInstanceOf(UnsupportedAlgorithmSuiteError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
  });

  it("fails when snapshot signer is not trusted", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      trustedDevices: [],
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
        deviceName: "Recovered laptop",
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignerNotTrustedError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
  });

  it("fails when snapshot signature verification fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).mockResolvedValueOnce(false);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
        deviceName: "Recovered laptop",
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignatureVerificationFailedError);

    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails before reading vault data when another vault is active", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSessionMaterial = {
      sessionId: ctx.values.sessionId,
      vaultId: "active-vault-id",
      sourceSnapshotRevision: 7,
      deviceId: ctx.values.deviceId,
      vaultMasterKey: ctx.values.vaultMasterKey,
      devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      payloadKey: ctx.values.unlockedVaultSessionPayloadKey,
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
        deviceName: "Recovered laptop",
      }),
    ).rejects.toBeInstanceOf(ActiveUnlockedVaultMismatchError);

    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("does not commit the recovered session when recovered local persistence fails", async () => {
    const ctx = createContext();
    const error = new Error("recovered local save failed");

    vi.mocked(
      ctx.ports.vaultLocalRepository.saveRecoveredLocalVault,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
        deviceName: "Recovered laptop",
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredLocalVault,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
  });
});
