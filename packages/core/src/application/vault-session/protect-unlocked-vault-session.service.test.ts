import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createUnlockedVaultSessionWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import { ProtectUnlockedVaultSessionService } from "./protect-unlocked-vault-session.service";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const session = createUnlockedVaultSessionWithEntries(
    values,
    [singlePasswordEntry],
    [],
    7,
  );
  const service = new ProtectUnlockedVaultSessionService(
    ports.crypto,
    ports.ids,
  );

  vi.mocked(ports.ids.generateId)
    .mockReset()
    .mockResolvedValue(values.sessionId);

  return {
    values,
    ports,
    session,
    service,
  };
}

describe("ProtectUnlockedVaultSessionService", () => {
  it("splits session material from the encrypted vault payload", async () => {
    const ctx = createContext();

    const result = await ctx.service.protect(ctx.session);

    const context = {
      sessionId: ctx.values.sessionId,
      vaultId: ctx.values.vaultId,
      sourceSnapshotRevision: 7,
    };

    expect(ctx.ports.ids.generateId).toHaveBeenCalled();
    expect(
      ctx.ports.crypto.generateUnlockedVaultSessionPayloadKey,
    ).toHaveBeenCalled();
    expect(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).toHaveBeenCalledWith(
      {
        vault: ctx.session.unlockedVault.vault,
      },
      ctx.values.unlockedVaultSessionPayloadKey,
      context,
    );
    expect(result).toEqual({
      material: {
        ...context,
        deviceId: ctx.values.deviceId,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
        payloadKey: ctx.values.unlockedVaultSessionPayloadKey,
      },
      encryptedPayload: {
        ...context,
        content: ctx.values.encryptedUnlockedVaultSessionPayload,
      },
    });
  });

  it("reuses active session material when protecting an existing session", async () => {
    const ctx = createContext();

    const result = await ctx.service.protect(ctx.session, {
      sessionId: "active-session-id",
      payloadKey: ctx.values.unlockedVaultSessionPayloadKey,
    });

    const context = {
      sessionId: "active-session-id",
      vaultId: ctx.values.vaultId,
      sourceSnapshotRevision: 7,
    };

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.generateUnlockedVaultSessionPayloadKey,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).toHaveBeenCalledWith(
      {
        vault: ctx.session.unlockedVault.vault,
      },
      ctx.values.unlockedVaultSessionPayloadKey,
      context,
    );
    expect(result.material.sessionId).toBe("active-session-id");
    expect(result.encryptedPayload.sessionId).toBe("active-session-id");
  });
});
