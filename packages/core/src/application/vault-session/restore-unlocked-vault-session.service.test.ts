import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSessionMaterial,
} from "../../domain/vault/unlocked-vault-session";
import { UnlockedVaultSessionInvalidError } from "../../use-cases/__errors/vault-session.errors";
import { RestoreUnlockedVaultSessionService } from "./restore-unlocked-vault-session.service";

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

  return {
    values,
    ports,
    material,
    encryptedPayload,
    service: new RestoreUnlockedVaultSessionService(ports.crypto),
  };
}

describe("RestoreUnlockedVaultSessionService", () => {
  it("decrypts the payload and restores the unlocked vault session", async () => {
    const ctx = createContext();

    const result = await ctx.service.restore(
      ctx.material,
      ctx.encryptedPayload,
    );

    const context = {
      sessionId: ctx.values.sessionId,
      vaultId: ctx.values.vaultId,
      sourceSnapshotRevision: 7,
    };

    expect(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).toHaveBeenCalledWith(
      ctx.values.encryptedUnlockedVaultSessionPayload,
      ctx.values.unlockedVaultSessionPayloadKey,
      context,
    );
    expect(result).toEqual({
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vault: ctx.values.decryptedVault,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      },
      sourceSnapshotRevision: 7,
    });
  });

  it("rejects mismatched session material and encrypted payload", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.restore(ctx.material, {
        ...ctx.encryptedPayload,
        vaultId: "other-vault-id",
      }),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionInvalidError);

    expect(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("uses encrypted payload revision when material revision is stale", async () => {
    const ctx = createContext();

    const result = await ctx.service.restore(
      {
        ...ctx.material,
        sourceSnapshotRevision: 6,
      },
      ctx.encryptedPayload,
    );

    expect(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).toHaveBeenCalledWith(
      ctx.values.encryptedUnlockedVaultSessionPayload,
      ctx.values.unlockedVaultSessionPayloadKey,
      {
        sessionId: ctx.values.sessionId,
        vaultId: ctx.values.vaultId,
        sourceSnapshotRevision: 7,
      },
    );
    expect(result.sourceSnapshotRevision).toBe(7);
  });

  it("rejects encrypted payload older than session material", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.restore(ctx.material, {
        ...ctx.encryptedPayload,
        sourceSnapshotRevision: 6,
      }),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionInvalidError);

    expect(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("wraps payload decryption failures as invalid session errors", async () => {
    const ctx = createContext();
    const decryptError = new Error("decrypt failed");

    vi.mocked(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(decryptError);

    let caught: unknown;

    try {
      await ctx.service.restore(ctx.material, ctx.encryptedPayload);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UnlockedVaultSessionInvalidError);
    expect((caught as Error).cause).toBe(decryptError);
  });
});
