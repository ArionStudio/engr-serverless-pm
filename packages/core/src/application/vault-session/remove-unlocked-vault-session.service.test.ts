import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSessionMaterial,
} from "../../domain/vault/unlocked-vault-session";
import { RemoveUnlockedVaultSessionService } from "./remove-unlocked-vault-session.service";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const material: UnlockedVaultSessionMaterial = {
    sessionId: values.sessionId,
    vaultId: values.vaultId,
    sourceSnapshotRevision: 7,
    deviceId: values.deviceId,
    vaultMasterKey: values.vaultMasterKey,
    devicePrivateSignKey: values.devicePrivateSignKey,
    payloadKey: values.unlockedVaultSessionPayloadKey,
  };
  const encryptedPayload: EncryptedUnlockedVaultSessionPayload = {
    sessionId: values.sessionId,
    vaultId: values.vaultId,
    sourceSnapshotRevision: 7,
    content: values.encryptedUnlockedVaultSessionPayload,
  };

  ports.saved.unlockedVaultSessionMaterial = material;
  ports.saved.encryptedUnlockedVaultSessionPayload = encryptedPayload;

  return {
    values,
    ports,
    material,
    encryptedPayload,
    service: new RemoveUnlockedVaultSessionService(
      ports.unlockedVaultSessionMaterialRepository,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
    ),
  };
}

describe("RemoveUnlockedVaultSessionService", () => {
  it("removes session material and encrypted payload", async () => {
    const ctx = createContext();

    await expect(ctx.service.remove()).resolves.toBeUndefined();

    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
  });

  it("removes encrypted payload when material removal fails", async () => {
    const ctx = createContext();
    const error = new Error("material remove failed");

    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(error);

    await expect(ctx.service.remove()).rejects.toBe(error);

    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
  });

  it("bubbles encrypted payload removal failure", async () => {
    const ctx = createContext();
    const error = new Error("payload remove failed");

    vi.mocked(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(error);

    await expect(ctx.service.remove()).rejects.toBe(error);

    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
  });

  it("preserves material removal failure when encrypted payload removal also fails", async () => {
    const ctx = createContext();
    const materialError = new Error("material remove failed");
    const payloadError = new Error("payload remove failed");

    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(materialError);
    vi.mocked(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(payloadError);

    await expect(ctx.service.remove()).rejects.toBe(materialError);

    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalledTimes(1);
  });
});
