import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createDeviceAccessRecords } from "../../__tests__/fixtures/device-access";
import { saveUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import {
  DeviceAccessMaterialChangedError,
  DeviceAccessMaterialIdentityMismatchError,
} from "../../errors/vault-device.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { InvalidRecoveryMnemonicError } from "../../errors/recovery.errors";
import { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";
import { SecretClipboardCopyService } from "../../services/clipboard/secret-clipboard-copy.service";
import { CopyRecoveryWordsUseCase } from "../clipboard/copy-recovery-words";
import { ReplaceRecoveryWordsUseCase } from "./replace-recovery-words";

function context() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const records = createDeviceAccessRecords(
    values,
    ports.crypto.algorithmSuite.id,
  );
  Object.assign(ports.saved, records);
  saveUnlockedVaultWithEntries(ports, values, []);
  vi.mocked(ports.ids.generateId)
    .mockReset()
    .mockResolvedValue(values.replacementLocalAccessGenerationId);
  const clipboard = {
    readText: vi.fn(async () => ""),
    writeText: vi.fn(async (_value: string) => {}),
  };
  const tasks = {
    get: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
  const clear = new ClipboardClearService(
    clipboard,
    tasks,
    ports.clock,
    ports.clipboardSecretHash,
  );
  const copy = new SecretClipboardCopyService(
    clipboard,
    clear,
    ports.clipboardSecretHash,
    ports.ids,
    tasks,
    ports.scheduledTasks,
    ports.clock,
  );
  return {
    values,
    ports,
    records,
    clipboard,
    tasks,
    replace: new ReplaceRecoveryWordsUseCase(
      ports.crypto,
      ports.bip39,
      ports.ids,
      ports.vaultLocalRepository,
      ports.sessionServices.unlockedVaultSession,
    ),
    copy: new CopyRecoveryWordsUseCase(
      ports.bip39,
      ports.crypto,
      ports.vaultLocalRepository,
      ports.sessionServices.unlockedVaultSession,
      ports.clipboardOperations,
      copy,
    ),
  };
}
function expectWiped(value: ArrayBuffer) {
  expect([...new Uint8Array(value)].every((byte) => byte === 0)).toBe(true);
}

describe("recovery words authorization and failure boundaries", () => {
  it("rejects both operations while locked before reading recovery data", async () => {
    const ctx = context();
    ctx.ports.saved.unlockedVaultSession = undefined;
    await expect(
      ctx.replace.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
    await expect(
      ctx.copy.execute({
        vaultId: ctx.values.vaultId,
        mnemonic: ctx.values.recoveryMnemonicKey,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecords,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecoveryBackup,
    ).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
  });

  it.each(["deviceId", "algorithmSuiteId", "localAccessGenerationId"] as const)(
    "rejects inconsistent %s without generating or replacing secrets",
    async (field) => {
      const ctx = context();
      ctx.ports.saved.deviceAccessRecoveryBackup = {
        ...ctx.records.deviceAccessRecoveryBackup,
        [field]: "different",
      };
      await expect(
        ctx.replace.execute({ vaultId: ctx.values.vaultId }),
      ).rejects.toBeInstanceOf(DeviceAccessMaterialIdentityMismatchError);
      expect(ctx.ports.crypto.generateRecoveryKey).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
      ).not.toHaveBeenCalled();
    },
  );

  it("rejects a trusted-device key mismatch before generating words", async () => {
    const ctx = context();
    vi.mocked(ctx.ports.crypto.verifyDeviceSignKeyPair)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(
      ctx.replace.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialIdentityMismatchError);
    expect(ctx.ports.crypto.generateRecoveryKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).not.toHaveBeenCalled();
  });

  it.each(["revision", "generation"])(
    "rejects an exhausted %s before generating words",
    async (boundary) => {
      const ctx = context();
      if (boundary === "revision")
        ctx.ports.saved.deviceAccessMaterial = {
          ...ctx.records.deviceAccessMaterial,
          revision: Number.MAX_SAFE_INTEGER,
        };
      else
        vi.mocked(ctx.ports.ids.generateId).mockResolvedValue(
          ctx.values.localAccessGenerationId,
        );
      await expect(
        ctx.replace.execute({ vaultId: ctx.values.vaultId }),
      ).rejects.toBeInstanceOf(DeviceAccessMaterialChangedError);
      expect(ctx.ports.crypto.generateRecoveryKey).not.toHaveBeenCalled();
      expect(
        ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
      ).not.toHaveBeenCalled();
    },
  );

  it.each(["wrap", "compare-and-swap"])(
    "wipes generated keys and preserves records and borrowed keys after %s failure",
    async (failure) => {
      const ctx = context();
      const borrowed = ctx.values.devicePrivateSignKey.slice(0);
      const key = new Uint8Array([11, 22])
        .buffer as typeof ctx.values.recoverySecretKey;
      const protection = new Uint8Array([33, 44]).buffer;
      vi.mocked(ctx.ports.crypto.generateRecoveryKey).mockResolvedValue(key);
      vi.mocked(
        ctx.ports.crypto.deriveRecoveryLocalKeysProtectionKey,
      ).mockResolvedValue(protection);
      const error = new DeviceAccessMaterialChangedError(ctx.values.vaultId);
      if (failure === "wrap")
        vi.mocked(ctx.ports.crypto.wrapLocalKeysPayload).mockRejectedValue(
          error,
        );
      else
        vi.mocked(
          ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
        ).mockRejectedValue(error);
      await expect(
        ctx.replace.execute({ vaultId: ctx.values.vaultId }),
      ).rejects.toBe(error);
      expect(ctx.ports.saved.deviceAccessMaterial).toBe(
        ctx.records.deviceAccessMaterial,
      );
      expect(ctx.ports.saved.deviceAccessRecoveryBackup).toBe(
        ctx.records.deviceAccessRecoveryBackup,
      );
      expect(ctx.values.devicePrivateSignKey).toEqual(borrowed);
      expectWiped(key);
      expectWiped(protection);
    },
  );

  it("replaces both access records with explicit compare-and-swap expectations and preserves the password wrapper", async () => {
    const ctx = context();
    await ctx.replace.execute({ vaultId: ctx.values.vaultId });
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecords,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDeviceAccessMaterialRevision:
          ctx.records.deviceAccessMaterial.revision,
        expectedDeviceAccessMaterialGenerationId:
          ctx.values.localAccessGenerationId,
        expectedDeviceAccessRecoveryBackupRevision:
          ctx.records.deviceAccessRecoveryBackup.revision,
        expectedDeviceAccessRecoveryBackupGenerationId:
          ctx.values.localAccessGenerationId,
      }),
    );
    expect(ctx.ports.saved.deviceAccessMaterial).toMatchObject({
      revision: 2,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
      protectedLocalKeys: ctx.records.deviceAccessMaterial.protectedLocalKeys,
    });
    expect(ctx.ports.saved.deviceAccessRecoveryBackup).toMatchObject({
      revision: 2,
      localAccessGenerationId: ctx.values.replacementLocalAccessGenerationId,
    });
  });

  it("rejects a recovery backup from a different access generation without clipboard effects", async () => {
    const ctx = context();
    ctx.ports.saved.deviceAccessRecoveryBackup = {
      ...ctx.records.deviceAccessRecoveryBackup,
      localAccessGenerationId: "stale-generation",
    };
    await expect(
      ctx.copy.execute({
        vaultId: ctx.values.vaultId,
        mnemonic: ctx.values.recoveryMnemonicKey,
      }),
    ).rejects.toBeInstanceOf(InvalidRecoveryMnemonicError);
    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
    expect(ctx.tasks.save).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("does not copy a mnemonic when its recovery wrapper cannot be opened", async () => {
    const ctx = context();
    const key = new Uint8Array([11])
      .buffer as typeof ctx.values.recoverySecretKey;
    const protection = new Uint8Array([22]).buffer;
    vi.mocked(ctx.ports.bip39.mnemonicToRecoveryKey).mockResolvedValue(key);
    vi.mocked(
      ctx.ports.crypto.deriveRecoveryLocalKeysProtectionKey,
    ).mockResolvedValue(protection);
    vi.mocked(ctx.ports.crypto.unwrapLocalKeysPayload).mockRejectedValue(
      new InvalidRecoveryMnemonicError(),
    );
    await expect(
      ctx.copy.execute({
        vaultId: ctx.values.vaultId,
        mnemonic: ctx.values.recoveryMnemonicKey,
      }),
    ).rejects.toBeInstanceOf(InvalidRecoveryMnemonicError);
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    expect(ctx.tasks.save).not.toHaveBeenCalled();
    expectWiped(key);
    expectWiped(protection);
  });

  it.each(["verifyDeviceSignKeyPair", "verifyDeviceVaultKeyPair"] as const)(
    "rejects recovered %s mismatch without copying and wipes the payload",
    async (verify) => {
      const ctx = context();
      const payload = {
        devicePrivateSignKey: new Uint8Array([1])
          .buffer as typeof ctx.values.devicePrivateSignKey,
        devicePrivateVaultKey: new Uint8Array([2])
          .buffer as typeof ctx.values.devicePrivateVaultKey,
        deviceLocalProtectionKey: new Uint8Array([3])
          .buffer as typeof ctx.values.deviceLocalProtectionKey,
        vaultTrustAnchor: ctx.values.vaultTrustAnchor,
      };
      vi.mocked(ctx.ports.crypto.unwrapLocalKeysPayload).mockResolvedValue(
        payload,
      );
      vi.mocked(ctx.ports.crypto[verify])
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      await expect(
        ctx.copy.execute({
          vaultId: ctx.values.vaultId,
          mnemonic: ctx.values.recoveryMnemonicKey,
        }),
      ).rejects.toBeInstanceOf(InvalidRecoveryMnemonicError);
      expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
      expectWiped(payload.devicePrivateSignKey);
      expectWiped(payload.devicePrivateVaultKey);
      expectWiped(payload.deviceLocalProtectionKey);
    },
  );
});
