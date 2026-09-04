import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChangeMasterPasswordUseCase,
  InitializeVaultUseCase,
  RecoverDeviceAccessUseCase,
  type RawMasterPassword,
} from "@lfspm/core";
import { createCoreTestPorts } from "../../../../../packages/core/src/__tests__/fixtures/ports";
import { createCoreTestValues } from "../../../../../packages/core/src/__tests__/fixtures/values";
import { createVaultManagerDb } from "../../infrastructure/database/dexie-db";
import { ScureBip39Adapter, WebCryptoAdapter } from "../crypto";
import { IndexedDbVaultLocalRepositoryAdapter } from "./indexeddb-vault-local-repository.adapter";
import { InvalidLocalVaultSecurityRecordError } from "../codecs/local-vault-security.codec";

let databaseCounter = 0;
let database: ReturnType<typeof createVaultManagerDb> | undefined;

afterEach(async () => {
  await database?.delete();
  database = undefined;
});

describe("IndexedDbVaultLocalRepositoryAdapter workflow integration", () => {
  it("round-trips initialization, password-change, and recovery writers", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const bip39 = new ScureBip39Adapter();
    const crypto = new WebCryptoAdapter();
    databaseCounter += 1;
    database = createVaultManagerDb(`lfspm-workflow-${databaseCounter}`);
    const vaults = new IndexedDbVaultLocalRepositoryAdapter(database);
    vi.mocked(ports.ids.generateId).mockReset();
    vi.mocked(ports.ids.generateId)
      .mockResolvedValueOnce(values.vaultId)
      .mockResolvedValueOnce(values.deviceId)
      .mockResolvedValueOnce("local-access-generation-1")
      .mockResolvedValueOnce(values.vaultLockActionId)
      .mockResolvedValue(values.sessionId);

    const initialize = new InitializeVaultUseCase(
      crypto,
      bip39,
      vaults,
      ports.sessionServices.unlockedVaultSession,
      ports.ids,
      ports.clock,
      ports.vaultDisplayName,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      ports.clipboardOperations,
    );
    const initializationResult = await initialize.execute({
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
      bip39,
      crypto,
      ports.ids,
      ports.sessionServices.unlockedVaultSession,
      vaults,
    );
    const recoveryResult = await recover.execute({
      vaultId: values.vaultId,
      recoveryMnemonicKey: initializationResult.recoveryMnemonicKey,
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
        recoveryMnemonicKey: recoveryResult.recoveryMnemonicKey,
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
