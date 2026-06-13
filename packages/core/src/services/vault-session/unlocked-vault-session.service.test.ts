import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createUnlockedVaultSessionWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSessionMaterial,
} from "../../domain/vault/unlocked-vault-session";
import {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionInvalidError,
  VaultMustBeUnlockedError,
} from "../../errors/vault-session.errors";
import { UnlockedVaultSessionService } from "./unlocked-vault-session.service";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const session = createUnlockedVaultSessionWithEntries(
    values,
    [singlePasswordEntry],
    [],
    7,
  );
  const service = new UnlockedVaultSessionService(
    ports.unlockedVaultSessionMaterialRepository,
    ports.encryptedUnlockedVaultSessionPayloadRepository,
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

function createMaterial(
  ctx: ReturnType<typeof createContext>,
  overrides: Partial<UnlockedVaultSessionMaterial> = {},
): UnlockedVaultSessionMaterial {
  return {
    sessionId: ctx.values.sessionId,
    vaultId: ctx.values.vaultId,
    sourceSnapshotRevision: 7,
    deviceId: ctx.values.deviceId,
    vaultMasterKey: ctx.values.vaultMasterKey,
    devicePrivateSignKey: ctx.values.devicePrivateSignKey,
    payloadKey: ctx.values.unlockedVaultSessionPayloadKey,
    ...overrides,
  };
}

function createEncryptedPayload(
  ctx: ReturnType<typeof createContext>,
  overrides: Partial<EncryptedUnlockedVaultSessionPayload> = {},
): EncryptedUnlockedVaultSessionPayload {
  return {
    sessionId: ctx.values.sessionId,
    vaultId: ctx.values.vaultId,
    sourceSnapshotRevision: 7,
    content: ctx.values.encryptedUnlockedVaultSessionPayload,
    ...overrides,
  };
}

function createActiveMaterial(
  ctx: ReturnType<typeof createContext>,
  vaultId = ctx.values.vaultId,
): UnlockedVaultSessionMaterial {
  return createMaterial(ctx, {
    sessionId: "active-session-id",
    vaultId,
    sourceSnapshotRevision: 6,
  });
}

describe("UnlockedVaultSessionService", () => {
  it("allows activation when no vault is active", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.requireVaultCanBeActivated(ctx.values.vaultId),
    ).resolves.toBeUndefined();
  });

  it("allows activation for the active vault", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(ctx);

    await expect(
      ctx.service.requireVaultCanBeActivated(ctx.values.vaultId),
    ).resolves.toBeUndefined();
  });

  it("rejects activation when another vault is active", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(ctx);

    await expect(
      ctx.service.requireVaultCanBeActivated("other-vault-id"),
    ).rejects.toBeInstanceOf(ActiveUnlockedVaultMismatchError);
  });

  it("returns null when no session material exists", async () => {
    const ctx = createContext();

    await expect(ctx.service.get()).resolves.toBeNull();

    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .getEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("restores the unlocked vault session from split records", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await expect(ctx.service.get()).resolves.toEqual({
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vault: ctx.values.decryptedVault,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      },
      sourceSnapshotRevision: 7,
    });
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
  });

  it("returns unlocked vault context for the requested active vault", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await expect(
      ctx.service.requireUnlockedVaultContext(
        ctx.values.vaultId,
        "test operation",
      ),
    ).resolves.toEqual({
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

  it("rejects unlocked vault context when no vault is unlocked", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.requireUnlockedVaultContext(
        ctx.values.vaultId,
        "test operation",
      ),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .getEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("rejects unlocked vault context for another active vault", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await expect(
      ctx.service.requireUnlockedVaultContext(
        "other-vault-id",
        "test operation",
      ),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
  });

  it("fails when session material exists without encrypted payload", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);

    await expect(ctx.service.get()).rejects.toBeInstanceOf(
      UnlockedVaultSessionInvalidError,
    );
  });

  it("rejects mismatched session material and encrypted payload", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx, {
        vaultId: "other-vault-id",
      });

    await expect(ctx.service.get()).rejects.toBeInstanceOf(
      UnlockedVaultSessionInvalidError,
    );
    expect(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("uses encrypted payload revision when material revision is stale", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx, {
      sourceSnapshotRevision: 6,
    });
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await expect(ctx.service.get()).resolves.toMatchObject({
      sourceSnapshotRevision: 7,
    });
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
  });

  it("rejects encrypted payload older than session material", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx, {
        sourceSnapshotRevision: 6,
      });

    await expect(ctx.service.get()).rejects.toBeInstanceOf(
      UnlockedVaultSessionInvalidError,
    );
    expect(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("wraps payload decryption failures as invalid session errors", async () => {
    const ctx = createContext();
    const decryptError = new Error("decrypt failed");

    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(decryptError);

    let caught: unknown;

    try {
      await ctx.service.get();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UnlockedVaultSessionInvalidError);
    expect((caught as Error).cause).toBe(decryptError);
  });

  it("commits a new unlocked vault session as encrypted payload then material", async () => {
    const ctx = createContext();

    await ctx.service.commit(ctx.session.unlockedVault, 7);

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
      {
        sessionId: ctx.values.sessionId,
        vaultId: ctx.values.vaultId,
        sourceSnapshotRevision: 7,
      },
    );
    expect(ctx.ports.saved.encryptedUnlockedVaultSessionPayload).toEqual({
      sessionId: ctx.values.sessionId,
      vaultId: ctx.values.vaultId,
      sourceSnapshotRevision: 7,
      content: ctx.values.encryptedUnlockedVaultSessionPayload,
    });
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toEqual({
      sessionId: ctx.values.sessionId,
      vaultId: ctx.values.vaultId,
      sourceSnapshotRevision: 7,
      deviceId: ctx.values.deviceId,
      vaultMasterKey: ctx.values.vaultMasterKey,
      devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      payloadKey: ctx.values.unlockedVaultSessionPayloadKey,
    });
    expect(
      vi.mocked(
        ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
          .saveEncryptedUnlockedVaultSessionPayload,
      ).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(
        ctx.ports.unlockedVaultSessionMaterialRepository
          .saveUnlockedVaultSessionMaterial,
      ).mock.invocationCallOrder[0],
    );
  });

  it("commits an active session using the existing session id and payload key", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(ctx);

    await ctx.service.commit(ctx.session.unlockedVault, 7);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.generateUnlockedVaultSessionPayloadKey,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.encryptedUnlockedVaultSessionPayload).toEqual({
      sessionId: "active-session-id",
      vaultId: ctx.values.vaultId,
      sourceSnapshotRevision: 7,
      content: ctx.values.encryptedUnlockedVaultSessionPayload,
    });
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toEqual({
      sessionId: "active-session-id",
      vaultId: ctx.values.vaultId,
      sourceSnapshotRevision: 7,
      deviceId: ctx.values.deviceId,
      vaultMasterKey: ctx.values.vaultMasterKey,
      devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      payloadKey: ctx.values.unlockedVaultSessionPayloadKey,
    });
  });

  it("rejects committing a different vault while another vault is active", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(
      ctx,
      "other-vault-id",
    );

    await expect(
      ctx.service.commit(ctx.session.unlockedVault, 7),
    ).rejects.toBeInstanceOf(ActiveUnlockedVaultMismatchError);

    expect(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("does not save material when encrypted payload save fails and cleans up", async () => {
    const ctx = createContext();
    const error = new Error("payload save failed");

    vi.mocked(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .saveEncryptedUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(error);

    await expect(ctx.service.commit(ctx.session.unlockedVault, 7)).rejects.toBe(
      error,
    );

    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalled();
  });

  it("does not clean up when commit fails before persistence", async () => {
    const ctx = createContext();
    const error = new Error("encrypt failed");

    vi.mocked(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(error);

    await expect(ctx.service.commit(ctx.session.unlockedVault, 7)).rejects.toBe(
      error,
    );

    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("invalidates the session when persisted snapshot commit fails", async () => {
    const ctx = createContext();
    const error = new Error("encrypt failed");

    vi.mocked(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.service.commitPersistedSnapshot(ctx.session.unlockedVault, 7),
    ).rejects.toBe(error);

    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalled();
  });

  it("does not invalidate another active vault after persisted snapshot commit mismatch", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(
      ctx,
      "other-vault-id",
    );

    await expect(
      ctx.service.commitPersistedSnapshot(ctx.session.unlockedVault, 7),
    ).rejects.toBeInstanceOf(ActiveUnlockedVaultMismatchError);

    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("removes session material and encrypted payload", async () => {
    const ctx = createContext();

    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await expect(ctx.service.remove()).resolves.toBeUndefined();

    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
  });

  it("removes encrypted payload when material removal fails", async () => {
    const ctx = createContext();
    const error = new Error("material remove failed");

    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
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

    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
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

    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
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
