import { describe, expect, it } from "vitest";
import { createCoreTestPorts } from "./ports";
import { createCoreTestValues } from "./values";
import { createVaultSnapshotServiceMock } from "./vault-entries";

function expectFreshCopies(
  first: ArrayBuffer,
  second: ArrayBuffer,
  source: ArrayBuffer,
): void {
  expect(first).not.toBe(second);
  expect(first).not.toBe(source);
  expect(second).not.toBe(source);
  expect(new Uint8Array(first)).toEqual(new Uint8Array(source));
  expect(new Uint8Array(second)).toEqual(new Uint8Array(source));
}

describe("createCoreTestPorts secret ownership", () => {
  it("returns fresh caller-owned buffers from generators and derivations", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);

    const [firstSignPair, secondSignPair] = await Promise.all([
      ports.crypto.generateDeviceSignKeyPair(),
      ports.crypto.generateDeviceSignKeyPair(),
    ]);
    expectFreshCopies(
      firstSignPair.privateKey,
      secondSignPair.privateKey,
      values.devicePrivateSignKey,
    );

    const [firstVaultPair, secondVaultPair] = await Promise.all([
      ports.crypto.generateDeviceVaultKeyPair(),
      ports.crypto.generateDeviceVaultKeyPair(),
    ]);
    expectFreshCopies(
      firstVaultPair.privateKey,
      secondVaultPair.privateKey,
      values.devicePrivateVaultKey,
    );

    const generationCases = await Promise.all([
      Promise.all([
        ports.crypto.generateDeviceLocalProtectionKey(),
        ports.crypto.generateDeviceLocalProtectionKey(),
      ]),
      Promise.all([
        ports.crypto.generateVaultMasterKey(),
        ports.crypto.generateVaultMasterKey(),
      ]),
      Promise.all([
        ports.crypto.generateRecoveryKey(),
        ports.crypto.generateRecoveryKey(),
      ]),
      Promise.all([
        ports.crypto.generateUnlockedVaultSessionPayloadKey(),
        ports.crypto.generateUnlockedVaultSessionPayloadKey(),
      ]),
    ]);
    const generationSources = [
      values.deviceLocalProtectionKey,
      values.vaultMasterKey,
      values.recoverySecretKey,
      values.unlockedVaultSessionPayloadKey,
    ];

    generationCases.forEach(([first, second], index) => {
      expectFreshCopies(first, second, generationSources[index]!);
    });

    const [firstLocalRootKey, secondLocalRootKey] = await Promise.all([
      ports.crypto.deriveLocalRootKey(
        values.masterPassword,
        values.masterPasswordSalt,
      ),
      ports.crypto.deriveLocalRootKey(
        values.masterPassword,
        values.masterPasswordSalt,
      ),
    ]);
    expectFreshCopies(
      firstLocalRootKey,
      secondLocalRootKey,
      values.localRootKey,
    );

    const [firstLocalProtectionKey, secondLocalProtectionKey] =
      await Promise.all([
        ports.crypto.deriveLocalKeysProtectionKey(
          firstLocalRootKey,
          values.localKeysProtectionSalt,
        ),
        ports.crypto.deriveLocalKeysProtectionKey(
          secondLocalRootKey,
          values.localKeysProtectionSalt,
        ),
      ]);
    expectFreshCopies(
      firstLocalProtectionKey,
      secondLocalProtectionKey,
      values.localKeysProtectionKey,
    );

    const [firstRecoveryProtectionKey, secondRecoveryProtectionKey] =
      await Promise.all([
        ports.crypto.deriveRecoveryLocalKeysProtectionKey(
          values.recoverySecretKey,
          values.recoveryLocalKeysProtectionSalt,
        ),
        ports.crypto.deriveRecoveryLocalKeysProtectionKey(
          values.recoverySecretKey,
          values.recoveryLocalKeysProtectionSalt,
        ),
      ]);
    expectFreshCopies(
      firstRecoveryProtectionKey,
      secondRecoveryProtectionKey,
      values.recoveryLocalKeysProtectionKey,
    );

    const [firstEnrollmentProtectionKey, secondEnrollmentProtectionKey] =
      await Promise.all([
        ports.crypto.deriveDeviceEnrollmentPrivateStateProtectionKey(
          firstLocalRootKey,
          values.localKeysProtectionSalt,
        ),
        ports.crypto.deriveDeviceEnrollmentPrivateStateProtectionKey(
          secondLocalRootKey,
          values.localKeysProtectionSalt,
        ),
      ]);
    expectFreshCopies(
      firstEnrollmentProtectionKey,
      secondEnrollmentProtectionKey,
      values.pendingEnrollmentProtectionKey,
    );

    const [firstRecoveryKey, secondRecoveryKey] = await Promise.all([
      ports.bip39.mnemonicToRecoveryKey(values.recoveryMnemonicKey),
      ports.bip39.mnemonicToRecoveryKey(values.recoveryMnemonicKey),
    ]);
    expectFreshCopies(
      firstRecoveryKey,
      secondRecoveryKey,
      values.recoverySecretKey,
    );
  });
});

describe("createCoreTestPorts vault lock tasks", () => {
  it("preserves the active task until its action ID matches removal", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const task = {
      actionId: values.vaultLockActionId,
      vaultId: values.vaultId,
      expiresAt: values.timestamp + 60_000,
    };

    await ports.vaultLockTasks.save(task);

    await expect(ports.vaultLockTasks.get()).resolves.toBe(task);
    await expect(
      ports.vaultLockTasks.removeIfActionIsActive("stale-action-id"),
    ).resolves.toBe(false);
    await expect(ports.vaultLockTasks.get()).resolves.toBe(task);
    await expect(
      ports.vaultLockTasks.removeIfActionIsActive(task.actionId),
    ).resolves.toBe(true);
    await expect(ports.vaultLockTasks.get()).resolves.toBeNull();
  });
});

describe("createCoreTestPorts vault persistence", () => {
  it("rejects malformed credential replacement parameter shapes", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const service = createVaultSnapshotServiceMock(values, ports);
    const snapshot = await service.requireLocalVaultSnapshot(values.vaultId);
    const save = ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint;
    const baseParams = {
      expectedSnapshotDigest: values.vaultSnapshotDigest,
      expectedCheckpoint: values.localVaultTrustCheckpoint,
      snapshot,
      checkpoint: values.localVaultTrustCheckpoint,
    };

    await expect(
      save({
        ...baseParams,
        expectedSyncCredentialState: values.encryptedDeviceSyncCredentialState,
      } as unknown as Parameters<typeof save>[0]),
    ).rejects.toThrow(
      "Expected valid sync credential state replacement parameters.",
    );
    await expect(
      save({
        ...baseParams,
        syncCredentialState: undefined,
      } as unknown as Parameters<typeof save>[0]),
    ).rejects.toThrow(
      "Expected valid sync credential state replacement parameters.",
    );
  });
});
