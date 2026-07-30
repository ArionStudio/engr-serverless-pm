import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createUnlockedVaultSessionWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionExpiredError,
  UnlockedVaultSessionInvalidError,
  VaultMustBeUnlockedError,
} from "../../errors/vault-session.errors";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSessionMaterial,
} from "../../domain/session/unlocked-vault-session.type";
import { UnlockedVaultSessionService } from "./unlocked-vault-session.service";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const sourceSnapshotVersionVector = { [values.deviceId]: 7 };
  const staleSourceSnapshotVersionVector = { [values.deviceId]: 6 };
  const session = createUnlockedVaultSessionWithEntries(
    values,
    [singlePasswordEntry],
    [],
    sourceSnapshotVersionVector,
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
    sourceSnapshotVersionVector,
    staleSourceSnapshotVersionVector,
    session,
    service,
  };
}

function createMaterial(
  ctx: ReturnType<typeof createContext>,
  overrides: Partial<UnlockedVaultSessionMaterial> = {},
) {
  return {
    sessionId: ctx.values.sessionId,
    vaultId: ctx.values.vaultId,
    sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
    deviceId: ctx.values.deviceId,
    vaultMasterKey: ctx.values.vaultMasterKey,
    devicePrivateSignKey: ctx.values.devicePrivateSignKey,
    devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
    deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
    payloadKey: ctx.values.unlockedVaultSessionPayloadKey,
    trustedSnapshotContext: ctx.session.unlockedVault.trustedSnapshotContext,
    vaultTrustAnchor: ctx.session.unlockedVault.vaultTrustAnchor,
    ...overrides,
  };
}

function createEncryptedPayload(
  ctx: ReturnType<typeof createContext>,
  overrides: Partial<EncryptedUnlockedVaultSessionPayload> = {},
) {
  return {
    sessionId: ctx.values.sessionId,
    vaultId: ctx.values.vaultId,
    sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
    content: ctx.values.encryptedUnlockedVaultSessionPayload,
    ...overrides,
  };
}

function createActiveMaterial(
  ctx: ReturnType<typeof createContext>,
  vaultId = ctx.values.vaultId,
) {
  return createMaterial(ctx, {
    sessionId: "active-session-id",
    vaultId,
    sourceSnapshotVersionVector: ctx.staleSourceSnapshotVersionVector,
  });
}

describe("UnlockedVaultSessionService", () => {
  it("allows activation when no vault is active", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.requireVaultCanBeActivated(ctx.values.vaultId),
    ).resolves.toBe(0);
  });

  it("allows activation for the active vault", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(ctx);

    await expect(
      ctx.service.requireVaultCanBeActivated(ctx.values.vaultId),
    ).resolves.toBe(0);
  });

  it("rejects activation when another vault is active", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(ctx);

    await expect(
      ctx.service.requireVaultCanBeActivated("other-vault-id"),
    ).rejects.toBeInstanceOf(ActiveUnlockedVaultMismatchError);
  });

  it("rejects activation after lock invalidates its lease", async () => {
    const ctx = createContext();
    const activationGeneration = await ctx.service.requireVaultCanBeActivated(
      ctx.values.vaultId,
    );

    await ctx.service.remove();

    await expect(
      ctx.service.activate(
        activationGeneration,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);

    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
  });

  it("consumes an activation lease", async () => {
    const ctx = createContext();
    const activationGeneration = await ctx.service.requireVaultCanBeActivated(
      ctx.values.vaultId,
    );

    await ctx.service.activate(
      activationGeneration,
      ctx.session.unlockedVault,
      ctx.sourceSnapshotVersionVector,
    );

    await expect(
      ctx.service.activate(
        activationGeneration,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);
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
      sessionId: ctx.values.sessionId,
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vault: ctx.values.decryptedVault,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
        devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
        deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
        trustedSnapshotContext:
          ctx.session.unlockedVault.trustedSnapshotContext,
        vaultTrustAnchor: ctx.session.unlockedVault.vaultTrustAnchor,
      },
      sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
    });
    expect(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).toHaveBeenCalledWith(
      ctx.values.encryptedUnlockedVaultSessionPayload,
      ctx.values.unlockedVaultSessionPayloadKey,
      {
        sessionId: ctx.values.sessionId,
        vaultId: ctx.values.vaultId,
        sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
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
      sessionId: ctx.values.sessionId,
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vault: ctx.values.decryptedVault,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
        devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
        deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
        trustedSnapshotContext:
          ctx.session.unlockedVault.trustedSnapshotContext,
        vaultTrustAnchor: ctx.session.unlockedVault.vaultTrustAnchor,
      },
      sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
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

  it("uses encrypted payload version when material version is stale", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx, {
      sourceSnapshotVersionVector: ctx.staleSourceSnapshotVersionVector,
    });
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await expect(ctx.service.get()).resolves.toMatchObject({
      sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
    });
    expect(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).toHaveBeenCalledWith(
      ctx.values.encryptedUnlockedVaultSessionPayload,
      ctx.values.unlockedVaultSessionPayloadKey,
      {
        sessionId: ctx.values.sessionId,
        vaultId: ctx.values.vaultId,
        sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
      },
    );
  });

  it("rejects encrypted payload older than session material", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx, {
        sourceSnapshotVersionVector: ctx.staleSourceSnapshotVersionVector,
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

    await ctx.service.activate(
      0,
      ctx.session.unlockedVault,
      ctx.sourceSnapshotVersionVector,
    );

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
        sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
      },
    );
    expect(ctx.ports.saved.encryptedUnlockedVaultSessionPayload).toEqual({
      sessionId: ctx.values.sessionId,
      vaultId: ctx.values.vaultId,
      sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
      content: ctx.values.encryptedUnlockedVaultSessionPayload,
    });
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toEqual({
      sessionId: ctx.values.sessionId,
      vaultId: ctx.values.vaultId,
      sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
      deviceId: ctx.values.deviceId,
      vaultMasterKey: ctx.values.vaultMasterKey,
      devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
      deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
      payloadKey: ctx.values.unlockedVaultSessionPayloadKey,
      trustedSnapshotContext: ctx.session.unlockedVault.trustedSnapshotContext,
      vaultTrustAnchor: ctx.session.unlockedVault.vaultTrustAnchor,
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

    await ctx.service.activate(
      0,
      ctx.session.unlockedVault,
      ctx.sourceSnapshotVersionVector,
    );

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.generateUnlockedVaultSessionPayloadKey,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.encryptedUnlockedVaultSessionPayload).toEqual({
      sessionId: "active-session-id",
      vaultId: ctx.values.vaultId,
      sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
      content: ctx.values.encryptedUnlockedVaultSessionPayload,
    });
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toEqual({
      sessionId: "active-session-id",
      vaultId: ctx.values.vaultId,
      sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
      deviceId: ctx.values.deviceId,
      vaultMasterKey: ctx.values.vaultMasterKey,
      devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
      deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
      payloadKey: ctx.values.unlockedVaultSessionPayloadKey,
      trustedSnapshotContext: ctx.session.unlockedVault.trustedSnapshotContext,
      vaultTrustAnchor: ctx.session.unlockedVault.vaultTrustAnchor,
    });
  });

  it("rejects committing a different vault while another vault is active", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(
      ctx,
      "other-vault-id",
    );

    await expect(
      ctx.service.activate(
        0,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
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

    await expect(
      ctx.service.activate(
        0,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
    ).rejects.toBe(error);

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

    await expect(
      ctx.service.activate(
        0,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
    ).rejects.toBe(error);

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
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    vi.mocked(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.service.commitPersistedSnapshot(
        ctx.values.sessionId,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
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

  it("rejects a persisted snapshot commit after the session was removed", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    const context = await ctx.service.requireUnlockedVaultContext(
      ctx.values.vaultId,
      "test operation",
    );
    await ctx.service.remove();

    await expect(
      ctx.service.commitPersistedSnapshot(
        context.sessionId,
        context.unlockedVault,
        context.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);

    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .saveEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
  });

  it("does not replace a newer session with a stale persisted snapshot commit", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    const context = await ctx.service.requireUnlockedVaultContext(
      ctx.values.vaultId,
      "test operation",
    );
    await ctx.service.remove();
    vi.mocked(ctx.ports.ids.generateId).mockResolvedValueOnce("new-session-id");
    const activationGeneration = await ctx.service.requireVaultCanBeActivated(
      ctx.values.vaultId,
    );
    await ctx.service.activate(
      activationGeneration,
      ctx.session.unlockedVault,
      ctx.sourceSnapshotVersionVector,
    );

    await expect(
      ctx.service.commitPersistedSnapshot(
        context.sessionId,
        context.unlockedVault,
        context.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);

    expect(ctx.ports.saved.unlockedVaultSessionMaterial?.sessionId).toBe(
      "new-session-id",
    );
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload?.sessionId,
    ).toBe("new-session-id");
  });

  it("restores state for a stale session and invalidates its replacement", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await ctx.service.remove();
    vi.mocked(ctx.ports.ids.generateId).mockResolvedValueOnce("new-session-id");
    const activationGeneration = await ctx.service.requireVaultCanBeActivated(
      ctx.values.vaultId,
    );
    await ctx.service.activate(
      activationGeneration,
      ctx.session.unlockedVault,
      ctx.sourceSnapshotVersionVector,
    );

    const restore = vi.fn();
    const restored = await ctx.service.restorePersistedState(
      ctx.values.sessionId,
      ctx.values.vaultId,
      restore,
    );

    expect(restored).toBe(true);
    expect(restore).toHaveBeenCalledOnce();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
  });

  it("does not allow lock to interleave with active session work", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    let continueOperation!: () => void;
    let markOperationStarted!: () => void;
    const operationStarted = new Promise<void>((resolve) => {
      markOperationStarted = resolve;
    });
    const operationCanContinue = new Promise<void>((resolve) => {
      continueOperation = resolve;
    });
    const activeOperation = ctx.service.persistForActiveSession(
      ctx.values.sessionId,
      ctx.values.vaultId,
      async () => {
        markOperationStarted();
        await operationCanContinue;
      },
    );

    await operationStarted;
    const lock = ctx.service.remove();
    await Promise.resolve();

    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeDefined();

    continueOperation();
    await activeOperation;
    await lock;

    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
  });

  it("keeps local enrollment state when session removal fails during discard", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const removeError = new Error("material removal failed");
    const discard = vi.fn(async () => undefined);

    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(removeError);

    await expect(
      ctx.service.discardIfSessionIsActive(
        ctx.values.sessionId,
        ctx.values.vaultId,
        discard,
      ),
    ).resolves.toBe(false);

    expect(discard).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toEqual(
      createMaterial(ctx),
    );
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
  });

  it("does not invalidate another active vault after persisted snapshot commit mismatch", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(
      ctx,
      "other-vault-id",
    );

    await expect(
      ctx.service.commitPersistedSnapshot(
        ctx.values.sessionId,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);

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

  it("does not resurrect a session after material removal fails", async () => {
    const ctx = createContext();
    const removeError = new Error("material remove failed");
    const persist = vi.fn(async () => undefined);

    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(removeError);

    await expect(ctx.service.remove()).rejects.toBe(removeError);

    await expect(
      ctx.service.persistForActiveSession(
        ctx.values.sessionId,
        ctx.values.vaultId,
        persist,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);
    await expect(
      ctx.service.commitPersistedSnapshot(
        ctx.values.sessionId,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);

    expect(persist).not.toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .saveEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
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
