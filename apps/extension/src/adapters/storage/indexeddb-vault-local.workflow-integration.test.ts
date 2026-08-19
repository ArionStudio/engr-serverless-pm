import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChangeMasterPasswordUseCase,
  InitializeVaultUseCase,
  RecoverDeviceAccessUseCase,
  type RawMasterPassword,
  type RecoveryKeyMnemonic,
  type RecoverySecretKey,
} from "@lfspm/core";
import { createCoreTestPorts } from "../../../../../packages/core/src/__tests__/fixtures/ports";
import { createCoreTestValues } from "../../../../../packages/core/src/__tests__/fixtures/values";
import { createVaultManagerDb } from "../../infrastructure/database/dexie-db";
import { WebCryptoPort } from "../crypto";
import { IndexedDbVaultLocalRepository } from "./indexeddb-vault-local.repository";
import { InvalidLocalVaultSecurityRecordError } from "../codecs/local-vault-security.codec";

let databaseCounter = 0;
let database: ReturnType<typeof createVaultManagerDb> | undefined;

afterEach(async () => {
  await database?.delete();
  database = undefined;
});

describe("IndexedDbVaultLocalRepository workflow integration", () => {
  it("round-trips initialization, password-change, and recovery writers", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const crypto = new WebCryptoPort();
    databaseCounter += 1;
    database = createVaultManagerDb(`lfspm-workflow-${databaseCounter}`);
    const vaults = new IndexedDbVaultLocalRepository(database);
    let recoveryKey: RecoverySecretKey | undefined;

    vi.mocked(ports.bip39.recoveryKeyToMnemonic).mockImplementation(
      async (key) => {
        recoveryKey = key.slice(0) as RecoverySecretKey;
        return values.recoveryMnemonicKey;
      },
    );
    vi.mocked(ports.bip39.mnemonicToRecoveryKey).mockImplementation(
      async () => {
        if (recoveryKey === undefined) {
          throw new Error("Recovery key was not captured by initialization.");
        }
        return recoveryKey.slice(0) as RecoverySecretKey;
      },
    );
    vi.mocked(ports.ids.generateId).mockReset();
    vi.mocked(ports.ids.generateId)
      .mockResolvedValueOnce(values.vaultId)
      .mockResolvedValueOnce(values.deviceId)
      .mockResolvedValueOnce("local-access-generation-1")
      .mockResolvedValueOnce(values.vaultLockActionId)
      .mockResolvedValue(values.sessionId);

    const initialize = new InitializeVaultUseCase(
      crypto,
      ports.bip39,
      vaults,
      ports.sessionServices.unlockedVaultSession,
      ports.ids,
      ports.clock,
      ports.vaultDisplayName,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      ports.clipboardOperations,
    );
    await initialize.execute({
      masterPassword: values.masterPassword,
      deviceName: "Integrated device",
      lockAfterMs: 60_000,
    });

    const initialized = await vaults.getDeviceAccessRecords(values.vaultId);
    expect(initialized.deviceAccessMaterial?.revision).toBe(1);
    expect(initialized.deviceAccessRecoveryBackup?.revision).toBe(1);
    await expect(
      vaults.getVaultSnapshot(values.vaultId),
    ).resolves.not.toBeNull();
    await expect(
      vaults.getLocalVaultTrustCheckpoint(values.vaultId),
    ).resolves.not.toBeNull();

    vi.mocked(ports.ids.generateId).mockReset();
    vi.mocked(ports.ids.generateId).mockResolvedValue(
      "local-access-generation-2",
    );
    const changePassword = new ChangeMasterPasswordUseCase(
      crypto,
      vaults,
      ports.sessionServices.unlockedVaultSession,
      ports.ids,
    );
    await changePassword.execute({
      vaultId: values.vaultId,
      currentMasterPassword: values.masterPassword,
      newMasterPassword: values.newMasterPassword,
    });
    expect(
      (await vaults.getDeviceAccessMaterial(values.vaultId))?.revision,
    ).toBe(2);

    await ports.sessionServices.unlockedVaultSession.remove();
    vi.mocked(ports.ids.generateId).mockReset();
    vi.mocked(ports.ids.generateId).mockResolvedValue(
      "local-access-generation-3",
    );
    const recover = new RecoverDeviceAccessUseCase(
      ports.bip39,
      crypto,
      ports.ids,
      ports.sessionServices.unlockedVaultSession,
      vaults,
    );
    await recover.execute({
      vaultId: values.vaultId,
      recoveryMnemonicKey: values.recoveryMnemonicKey as RecoveryKeyMnemonic,
      newMasterPassword: "A9!recovered-master-password" as RawMasterPassword,
    });

    const recovered = await vaults.getDeviceAccessRecords(values.vaultId);
    expect(recovered.deviceAccessMaterial?.revision).toBe(3);
    expect(recovered.deviceAccessRecoveryBackup?.revision).toBe(3);
    expect(recovered.deviceAccessMaterial?.localAccessGenerationId).toBe(
      "local-access-generation-3",
    );

    const checkpointRecord = await database.localVaultTrustCheckpoints.get(
      values.vaultId,
    );
    if (checkpointRecord === undefined) {
      throw new Error("Expected a persisted checkpoint.");
    }
    const checkpointArtifact = record(
      structuredClone(checkpointRecord.artifact),
    );
    record(checkpointArtifact.signature).signature = "AA";
    await database.localVaultTrustCheckpoints.put({
      ...checkpointRecord,
      artifact: checkpointArtifact,
    });
    const verifyCheckpoint = vi.spyOn(
      crypto,
      "verifyLocalVaultTrustCheckpointSignature",
    );
    vi.mocked(ports.ids.generateId).mockReset();
    vi.mocked(ports.ids.generateId).mockResolvedValue(
      "local-access-generation-4",
    );

    await expect(
      recover.execute({
        vaultId: values.vaultId,
        recoveryMnemonicKey: values.recoveryMnemonicKey,
        newMasterPassword: "B8!another-recovered-password" as RawMasterPassword,
      }),
    ).rejects.toBeInstanceOf(InvalidLocalVaultSecurityRecordError);
    expect(verifyCheckpoint).not.toHaveBeenCalled();
    expect(
      (await vaults.getDeviceAccessMaterial(values.vaultId))?.revision,
    ).toBe(3);
  });
});

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a record in the test fixture.");
  }
  return value as Record<string, unknown>;
}
