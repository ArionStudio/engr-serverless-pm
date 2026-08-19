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
import type { ClipboardOperationLease } from "../../ports/clipboard/clipboard-operation-coordinator.port";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/session/unlocked-vault-session-material-repository.port";
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
    ports.clipboardOperations,
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
    ).resolves.toEqual({ localGeneration: 0, sharedEpoch: 0 });
  });

  it("allows activation for the active vault", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(ctx);

    await expect(
      ctx.service.requireVaultCanBeActivated(ctx.values.vaultId),
    ).resolves.toEqual({ localGeneration: 0, sharedEpoch: 0 });
  });

  it("fails activation authorization before reading material when the shared epoch is unavailable", async () => {
    const ctx = createContext();
    const error = new Error("session epoch unavailable");
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionEpoch,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.service.requireVaultCanBeActivated(ctx.values.vaultId),
    ).rejects.toBe(error);

    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getPersistedUnlockedVaultSessionIdentity,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
  });

  it("rejects activation authorized before another context advances the shared epoch", async () => {
    const ctx = createContext();
    const activationAuthorization =
      await ctx.service.requireVaultCanBeActivated(ctx.values.vaultId);
    ctx.ports.saved.unlockedVaultSessionEpoch += 1;

    await expect(
      ctx.service.activate(
        activationAuthorization,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);

    expect(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
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
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
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

    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);

    await expect(
      ctx.service.activate(
        activationGeneration,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
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

  it("reloads authoritative material after reconciling a cross-context snapshot commit", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const sharedMaterialRepository =
      ctx.ports.unlockedVaultSessionMaterialRepository;
    let cachedReaderMaterial: UnlockedVaultSessionMaterial | null | undefined;
    const readerMaterialRepository: UnlockedVaultSessionMaterialRepositoryPort =
      {
        ...sharedMaterialRepository,
        getUnlockedVaultSessionMaterial: vi.fn(async () => {
          if (cachedReaderMaterial !== undefined) {
            return cachedReaderMaterial;
          }

          const sharedMaterial =
            await sharedMaterialRepository.getUnlockedVaultSessionMaterial();
          const restoredMaterial =
            sharedMaterial === null ? null : structuredClone(sharedMaterial);
          cachedReaderMaterial = restoredMaterial;
          return cachedReaderMaterial;
        }),
        evictCachedUnlockedVaultSessionMaterial: vi.fn(async (sessionId) => {
          if (cachedReaderMaterial?.sessionId === sessionId) {
            cachedReaderMaterial = undefined;
          }
        }),
      };
    const reader = new UnlockedVaultSessionService(
      readerMaterialRepository,
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository,
      ctx.ports.crypto,
      ctx.ports.ids,
      ctx.ports.clipboardOperations,
    );

    await expect(reader.get()).resolves.toMatchObject({
      sourceSnapshotVersionVector: ctx.sourceSnapshotVersionVector,
    });
    const staleReaderMaterial = cachedReaderMaterial;

    if (staleReaderMaterial === undefined || staleReaderMaterial === null) {
      throw new Error("Expected the reader to cache session material.");
    }

    const advancedSourceSnapshotVersionVector = { [ctx.values.deviceId]: 8 };
    await ctx.service.commitPersistedSnapshot(
      ctx.values.sessionId,
      ctx.session.unlockedVault,
      advancedSourceSnapshotVersionVector,
    );

    await expect(reader.get()).resolves.toBeNull();
    for (const secret of [
      staleReaderMaterial.vaultMasterKey,
      staleReaderMaterial.devicePrivateSignKey,
      staleReaderMaterial.devicePrivateVaultKey,
      staleReaderMaterial.deviceLocalProtectionKey,
      staleReaderMaterial.payloadKey,
    ]) {
      expect(Array.from(new Uint8Array(secret))).toEqual([0]);
    }
    await expect(reader.get()).resolves.toMatchObject({
      sessionId: ctx.values.sessionId,
      sourceSnapshotVersionVector: advancedSourceSnapshotVersionVector,
    });
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
    const material = createMaterial(ctx);
    ctx.ports.saved.unlockedVaultSessionMaterial = material;

    await expect(ctx.service.get()).rejects.toBeInstanceOf(
      UnlockedVaultSessionInvalidError,
    );
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
    for (const secret of [
      material.vaultMasterKey,
      material.devicePrivateSignKey,
      material.devicePrivateVaultKey,
      material.deviceLocalProtectionKey,
      material.payloadKey,
    ]) {
      expect(Array.from(new Uint8Array(secret))).toEqual([0]);
    }
  });

  it("revokes and removes session records when authoritative identity cannot be read", async () => {
    const ctx = createContext();
    const material = createMaterial(ctx);
    const identityError = new Error("session identity is malformed");
    ctx.ports.saved.unlockedVaultSessionMaterial = material;
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getPersistedUnlockedVaultSessionIdentity,
    ).mockRejectedValueOnce(identityError);

    await expect(ctx.service.get()).rejects.toBe(identityError);

    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
    for (const secret of [
      material.vaultMasterKey,
      material.devicePrivateSignKey,
      material.devicePrivateVaultKey,
      material.deviceLocalProtectionKey,
      material.payloadKey,
    ]) {
      expect(Array.from(new Uint8Array(secret))).toEqual([0]);
    }
  });

  it("revokes another context's activation authorization when invalid-session restoration removes material", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    const activationAuthorization =
      await ctx.service.requireVaultCanBeActivated(ctx.values.vaultId);
    const cleanupContext = new UnlockedVaultSessionService(
      ctx.ports.unlockedVaultSessionMaterialRepository,
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository,
      ctx.ports.crypto,
      ctx.ports.ids,
      ctx.ports.clipboardOperations,
    );

    await expect(cleanupContext.get()).rejects.toBeInstanceOf(
      UnlockedVaultSessionInvalidError,
    );
    await expect(
      ctx.service.activate(
        activationAuthorization,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);

    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
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
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
  });

  it("commits a new unlocked vault session as encrypted payload then material", async () => {
    const ctx = createContext();

    await ctx.service.activate(
      { localGeneration: 0, sharedEpoch: 0 },
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

  it("wipes the exact material identity retained after successful activation", async () => {
    const ctx = createContext();

    await ctx.service.activate(
      { localGeneration: 0, sharedEpoch: 0 },
      ctx.session.unlockedVault,
      ctx.sourceSnapshotVersionVector,
    );
    const issuedSession = await ctx.service.get();
    const ownedMaterial = ctx.ports.saved.unlockedVaultSessionMaterial;

    if (issuedSession === null || ownedMaterial === undefined) {
      throw new Error("Expected activated session material.");
    }

    expect(issuedSession.unlockedVault.vaultMasterKey).toBe(
      ownedMaterial.vaultMasterKey,
    );
    expect(issuedSession.unlockedVault.devicePrivateSignKey).toBe(
      ownedMaterial.devicePrivateSignKey,
    );

    await ctx.service.remove();

    for (const secret of [
      issuedSession.unlockedVault.vaultMasterKey,
      issuedSession.unlockedVault.devicePrivateSignKey,
      issuedSession.unlockedVault.devicePrivateVaultKey,
      issuedSession.unlockedVault.deviceLocalProtectionKey,
      ownedMaterial.payloadKey,
    ]) {
      expect(Array.from(new Uint8Array(secret))).toEqual([0]);
    }
  });

  it("reactivates the active vault with a fresh session id and payload key", async () => {
    const ctx = createContext();
    const activeMaterial = createActiveMaterial(ctx);
    ctx.ports.saved.unlockedVaultSessionMaterial = activeMaterial;

    await ctx.service.activate(
      { localGeneration: 0, sharedEpoch: 0 },
      ctx.session.unlockedVault,
      ctx.sourceSnapshotVersionVector,
    );

    expect(ctx.ports.ids.generateId).toHaveBeenCalledOnce();
    expect(
      ctx.ports.crypto.generateUnlockedVaultSessionPayloadKey,
    ).toHaveBeenCalledOnce();
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
    expect(ctx.ports.saved.unlockedVaultSessionMaterial?.payloadKey).not.toBe(
      activeMaterial.payloadKey,
    );
  });

  it("rejects work authorized before same-vault reactivation", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const staleContext = await ctx.service.requireUnlockedVaultContext(
      ctx.values.vaultId,
      "test operation",
    );
    const activationGeneration = await ctx.service.requireVaultCanBeActivated(
      ctx.values.vaultId,
    );
    vi.mocked(ctx.ports.ids.generateId).mockResolvedValueOnce(
      "replacement-session-id",
    );

    await ctx.service.activate(
      activationGeneration,
      staleContext.unlockedVault,
      staleContext.sourceSnapshotVersionVector,
    );

    const persist = vi.fn(async () => undefined);
    await expect(
      ctx.service.persistForActiveSession(
        staleContext.sessionId,
        ctx.values.vaultId,
        persist,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);
    await expect(
      ctx.service.commitPersistedSnapshot(
        staleContext.sessionId,
        staleContext.unlockedVault,
        staleContext.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);

    expect(persist).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial?.sessionId).toBe(
      "replacement-session-id",
    );
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload?.sessionId,
    ).toBe("replacement-session-id");
  });

  it("rejects committing a different vault while another vault is active", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(
      ctx,
      "other-vault-id",
    );

    await expect(
      ctx.service.activate(
        { localGeneration: 0, sharedEpoch: 0 },
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
        { localGeneration: 0, sharedEpoch: 0 },
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
        { localGeneration: 0, sharedEpoch: 0 },
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
    const payloadKey = await vi.mocked(
      ctx.ports.crypto.generateUnlockedVaultSessionPayloadKey,
    ).mock.results[0]!.value;
    expect(Array.from(new Uint8Array(payloadKey))).toEqual([0]);
    expect(
      Array.from(new Uint8Array(ctx.values.unlockedVaultSessionPayloadKey)),
    ).toEqual([2]);
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
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
  });

  it("preserves an epoch failure while removing a partially committed session", async () => {
    const ctx = createContext();
    const epochError = new Error("session epoch unavailable");
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .advanceUnlockedVaultSessionEpoch,
    ).mockRejectedValueOnce(epochError);

    await expect(
      ctx.service.commitPersistedSnapshot(
        ctx.values.sessionId,
        ctx.session.unlockedVault,
        { [ctx.values.deviceId]: 8 },
      ),
    ).rejects.toBe(epochError);

    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
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

  it("invalidates an activation lease when the active session advances", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const activationGeneration = await ctx.service.requireVaultCanBeActivated(
      ctx.values.vaultId,
    );

    await ctx.service.commitPersistedSnapshot(
      ctx.values.sessionId,
      ctx.session.unlockedVault,
      { [ctx.values.deviceId]: 8 },
    );

    await expect(
      ctx.service.activate(
        activationGeneration,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toMatchObject({
      sourceSnapshotVersionVector: { [ctx.values.deviceId]: 8 },
    });
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
  });

  it("does not restore state or invalidate a replacement session", async () => {
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
      ctx.sourceSnapshotVersionVector,
      restore,
    );

    expect(restored).toBe("session_advanced");
    expect(restore).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial?.sessionId).toBe(
      "new-session-id",
    );
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload?.sessionId,
    ).toBe("new-session-id");
  });

  it("wipes stale cached material without restoring over persisted replacement ownership", async () => {
    const ctx = createContext();
    const staleMaterial = createMaterial(ctx);
    ctx.ports.saved.unlockedVaultSessionMaterial = staleMaterial;
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getPersistedUnlockedVaultSessionIdentity,
    ).mockResolvedValue({
      sessionId: "replacement-session-id",
      vaultId: ctx.values.vaultId,
      sourceSnapshotVersionVector: { [ctx.values.deviceId]: 8 },
    });
    const restore = vi.fn(async () => undefined);

    await expect(
      ctx.service.restorePersistedState(
        ctx.values.sessionId,
        ctx.values.vaultId,
        ctx.sourceSnapshotVersionVector,
        restore,
      ),
    ).resolves.toBe("session_advanced");

    expect(restore).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .evictCachedUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledWith(ctx.values.sessionId);
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    for (const secret of [
      staleMaterial.vaultMasterKey,
      staleMaterial.devicePrivateSignKey,
      staleMaterial.devicePrivateVaultKey,
      staleMaterial.deviceLocalProtectionKey,
      staleMaterial.payloadKey,
    ]) {
      expect(Array.from(new Uint8Array(secret))).toEqual([0]);
    }
  });

  it("does not restore state or invalidate an advanced session", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await ctx.service.commitPersistedSnapshot(
      ctx.values.sessionId,
      ctx.session.unlockedVault,
      { [ctx.values.deviceId]: 8 },
    );

    const restore = vi.fn();
    const restored = await ctx.service.restorePersistedState(
      ctx.values.sessionId,
      ctx.values.vaultId,
      ctx.sourceSnapshotVersionVector,
      restore,
    );

    expect(restored).toBe("session_advanced");
    expect(restore).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toMatchObject({
      sessionId: ctx.values.sessionId,
      sourceSnapshotVersionVector: { [ctx.values.deviceId]: 8 },
    });
  });

  it("reports rollback failure without restoring when session ownership cannot be read", async () => {
    const ctx = createContext();
    const material = createMaterial(ctx);
    ctx.ports.saved.unlockedVaultSessionMaterial = material;
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const restore = vi.fn();

    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(new Error("material read failed"));

    await expect(
      ctx.service.restorePersistedState(
        ctx.values.sessionId,
        ctx.values.vaultId,
        ctx.sourceSnapshotVersionVector,
        restore,
      ),
    ).resolves.toBe("rollback_failed");

    expect(restore).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBe(material);
    expect(ctx.ports.saved.encryptedUnlockedVaultSessionPayload).toBeDefined();
  });

  it("reports rollback failure when cross-context coordination cannot start", async () => {
    const ctx = createContext();
    const restore = vi.fn(async () => undefined);
    vi.spyOn(
      ctx.ports.clipboardOperations,
      "runExclusive",
    ).mockRejectedValueOnce(new Error("coordination unavailable"));

    await expect(
      ctx.service.restorePersistedState(
        ctx.values.sessionId,
        ctx.values.vaultId,
        ctx.sourceSnapshotVersionVector,
        restore,
      ),
    ).resolves.toBe("rollback_failed");

    expect(restore).not.toHaveBeenCalled();
  });

  it("invalidates a pending activation lease before restoring without active material", async () => {
    const ctx = createContext();
    const activationGeneration = await ctx.service.requireVaultCanBeActivated(
      ctx.values.vaultId,
    );
    const restore = vi.fn(async () => undefined);

    await expect(
      ctx.service.restorePersistedState(
        ctx.values.sessionId,
        ctx.values.vaultId,
        ctx.sourceSnapshotVersionVector,
        restore,
      ),
    ).resolves.toBe("restored");
    await expect(
      ctx.service.activate(
        activationGeneration,
        ctx.session.unlockedVault,
        ctx.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);

    expect(restore).toHaveBeenCalledOnce();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
  });

  it("does not restore without active material when epoch revocation fails", async () => {
    const ctx = createContext();
    const epochError = new Error("session epoch unavailable");
    const restore = vi.fn(async () => undefined);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .advanceUnlockedVaultSessionEpoch,
    ).mockRejectedValueOnce(epochError);

    await expect(
      ctx.service.restorePersistedState(
        ctx.values.sessionId,
        ctx.values.vaultId,
        ctx.sourceSnapshotVersionVector,
        restore,
      ),
    ).resolves.toBe("rollback_failed");

    expect(restore).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(0);
  });

  it("revokes activation authorization when restore rollback removes an active session", async () => {
    const ctx = createContext();
    const restoreError = new Error("restore failed");
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await expect(
      ctx.service.restorePersistedState(
        ctx.values.sessionId,
        ctx.values.vaultId,
        ctx.sourceSnapshotVersionVector,
        async () => Promise.reject(restoreError),
      ),
    ).resolves.toBe("rollback_failed");

    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
  });

  it.each([
    ["successful", vi.fn(async () => undefined)],
    ["failed", vi.fn(async () => Promise.reject(new Error("restore failed")))],
  ])(
    "preserves another vault session after a %s restore",
    async (_name, restore) => {
      const ctx = createContext();
      ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(
        ctx,
        "other-vault-id",
      );
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
        createEncryptedPayload(ctx, { vaultId: "other-vault-id" });

      await ctx.service.restorePersistedState(
        ctx.values.sessionId,
        ctx.values.vaultId,
        ctx.sourceSnapshotVersionVector,
        restore,
      );

      expect(ctx.ports.saved.unlockedVaultSessionMaterial?.vaultId).toBe(
        "other-vault-id",
      );
      expect(
        ctx.ports.saved.encryptedUnlockedVaultSessionPayload?.vaultId,
      ).toBe("other-vault-id");
    },
  );

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

  it("invalidates a pending activation lease before active-session persistence starts", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const activationGeneration = await ctx.service.requireVaultCanBeActivated(
      ctx.values.vaultId,
    );
    let continuePersistence!: () => void;
    let markPersistenceStarted!: () => void;
    const persistenceStarted = new Promise<void>((resolve) => {
      markPersistenceStarted = resolve;
    });
    const persistenceCanContinue = new Promise<void>((resolve) => {
      continuePersistence = resolve;
    });
    const persist = vi.fn(async () => {
      markPersistenceStarted();
      await persistenceCanContinue;
    });
    const persistence = ctx.service.persistForActiveSession(
      ctx.values.sessionId,
      ctx.values.vaultId,
      persist,
    );
    await persistenceStarted;
    const staleActivation = ctx.service.activate(
      activationGeneration,
      ctx.session.unlockedVault,
      ctx.sourceSnapshotVersionVector,
    );
    continuePersistence();
    await persistence;

    await expect(staleActivation).rejects.toBeInstanceOf(
      UnlockedVaultSessionExpiredError,
    );
    expect(persist).toHaveBeenCalledOnce();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial?.sessionId).toBe(
      ctx.values.sessionId,
    );
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
  });

  it("does not start active-session persistence when epoch revocation fails", async () => {
    const ctx = createContext();
    const epochError = new Error("session epoch unavailable");
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .advanceUnlockedVaultSessionEpoch,
    ).mockRejectedValueOnce(epochError);
    const persist = vi.fn(async () => undefined);

    await expect(
      ctx.service.persistForActiveSession(
        ctx.values.sessionId,
        ctx.values.vaultId,
        persist,
      ),
    ).rejects.toBe(epochError);

    expect(persist).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeDefined();
  });

  it("revokes activation authorization before authenticated discard", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const discard = vi.fn(async () => true);

    await expect(
      ctx.service.discardIfSessionIsActive(
        ctx.values.sessionId,
        ctx.values.vaultId,
        0,
        ctx.sourceSnapshotVersionVector,
        async () => undefined,
        discard,
      ),
    ).resolves.toBe("discarded");

    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(discard).toHaveBeenCalledOnce();
  });

  it("continues authenticated discard removal when epoch revocation fails", async () => {
    const ctx = createContext();
    const epochError = new Error("session epoch unavailable");
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .advanceUnlockedVaultSessionEpoch,
    ).mockRejectedValueOnce(epochError);
    const discard = vi.fn(async () => true);

    await expect(
      ctx.service.discardIfSessionIsActive(
        ctx.values.sessionId,
        ctx.values.vaultId,
        0,
        ctx.sourceSnapshotVersionVector,
        async () => undefined,
        discard,
      ),
    ).resolves.toBe("rollback_failed");

    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
    expect(discard).not.toHaveBeenCalled();
  });

  it("keeps local enrollment state when session removal fails during discard", async () => {
    const ctx = createContext();
    const material = createMaterial(ctx);
    ctx.ports.saved.unlockedVaultSessionMaterial = material;
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const removeError = new Error("material removal failed");
    const discard = vi.fn(async () => true);

    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(removeError);

    await expect(
      ctx.service.discardIfSessionIsActive(
        ctx.values.sessionId,
        ctx.values.vaultId,
        0,
        ctx.sourceSnapshotVersionVector,
        async () => undefined,
        discard,
      ),
    ).resolves.toBe("rollback_failed");

    expect(discard).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBe(material);
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
    for (const secret of [
      material.vaultMasterKey,
      material.devicePrivateSignKey,
      material.devicePrivateVaultKey,
      material.deviceLocalProtectionKey,
      material.payloadKey,
    ]) {
      expect(Array.from(new Uint8Array(secret))).toEqual([0]);
    }
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
  });

  it("does not discard enrollment state after the active session advances", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const discard = vi.fn(async () => true);

    await ctx.service.commitPersistedSnapshot(
      ctx.values.sessionId,
      ctx.session.unlockedVault,
      { [ctx.values.deviceId]: 8 },
    );

    await expect(
      ctx.service.discardIfSessionIsActive(
        ctx.values.sessionId,
        ctx.values.vaultId,
        0,
        ctx.sourceSnapshotVersionVector,
        async () => undefined,
        discard,
      ),
    ).resolves.toBe("session_advanced");

    expect(discard).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toMatchObject({
      sourceSnapshotVersionVector: { [ctx.values.deviceId]: 8 },
    });
  });

  it("preserves an advanced session when its material cannot be read during discard", async () => {
    const ctx = createContext();
    const material = createMaterial(ctx);
    ctx.ports.saved.unlockedVaultSessionMaterial = material;
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const beforeRemoval = vi.fn(async () => undefined);
    const discard = vi.fn(async () => true);

    await ctx.service.commitPersistedSnapshot(
      ctx.values.sessionId,
      ctx.session.unlockedVault,
      { [ctx.values.deviceId]: 8 },
    );
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(new Error("material read failed"));

    await expect(
      ctx.service.discardIfSessionIsActive(
        ctx.values.sessionId,
        ctx.values.vaultId,
        0,
        ctx.sourceSnapshotVersionVector,
        beforeRemoval,
        discard,
      ),
    ).resolves.toBe("session_advanced");

    expect(beforeRemoval).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeDefined();
  });

  it("does not discard when current session ownership cannot be read", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const beforeRemoval = vi.fn(async () => undefined);
    const discard = vi.fn(async () => true);

    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(new Error("material read failed"));

    await expect(
      ctx.service.discardIfSessionIsActive(
        ctx.values.sessionId,
        ctx.values.vaultId,
        0,
        ctx.sourceSnapshotVersionVector,
        beforeRemoval,
        discard,
      ),
    ).resolves.toBe("session_advanced");

    expect(beforeRemoval).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeDefined();
  });

  it("distinguishes a removed session generation from an advanced snapshot", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const discard = vi.fn(async () => true);

    await ctx.service.remove();

    await expect(
      ctx.service.discardIfSessionIsActive(
        ctx.values.sessionId,
        ctx.values.vaultId,
        0,
        ctx.sourceSnapshotVersionVector,
        async () => undefined,
        discard,
      ),
    ).resolves.toBe("session_replaced");
    expect(discard).not.toHaveBeenCalled();
  });

  it("withholds targeted cleanup after reconciling stale cached ownership", async () => {
    const ctx = createContext();
    const staleMaterial = createMaterial(ctx);
    ctx.ports.saved.unlockedVaultSessionMaterial = staleMaterial;
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getPersistedUnlockedVaultSessionIdentity,
    ).mockResolvedValue({
      sessionId: "replacement-session-id",
      vaultId: ctx.values.vaultId,
      sourceSnapshotVersionVector: { [ctx.values.deviceId]: 8 },
    });
    const beforeRemoval = vi.fn(async () => true);
    const afterRemoval = vi.fn(async () => undefined);

    await expect(
      ctx.service.cleanupActiveSession(
        ctx.values.vaultId,
        false,
        beforeRemoval,
        afterRemoval,
      ),
    ).resolves.toBe("session_unavailable");

    expect(beforeRemoval).not.toHaveBeenCalled();
    expect(afterRemoval).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .evictCachedUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledWith(ctx.values.sessionId);
  });

  it("allows targeted cleanup after the same session advances", async () => {
    const ctx = createContext();
    const staleMaterial = createMaterial(ctx);
    ctx.ports.saved.unlockedVaultSessionMaterial = staleMaterial;
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getPersistedUnlockedVaultSessionIdentity,
    ).mockResolvedValue({
      sessionId: ctx.values.sessionId,
      vaultId: ctx.values.vaultId,
      sourceSnapshotVersionVector: { [ctx.values.deviceId]: 8 },
    });
    const beforeRemoval = vi.fn(async () => true);
    const afterRemoval = vi.fn(async () => undefined);

    await expect(
      ctx.service.cleanupActiveSession(
        ctx.values.vaultId,
        false,
        beforeRemoval,
        afterRemoval,
      ),
    ).resolves.toBe("removed");

    expect(beforeRemoval).toHaveBeenCalledWith({
      sessionId: ctx.values.sessionId,
      vaultId: ctx.values.vaultId,
      generation: 1,
    });
    expect(afterRemoval).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalledTimes(1);
  });

  it("runs post-removal cleanup after records are removed despite an earlier error", async () => {
    const ctx = createContext();
    const epochError = new Error("session epoch unavailable");
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .advanceUnlockedVaultSessionEpoch,
    ).mockRejectedValueOnce(epochError);
    const afterRemoval = vi.fn(async () => undefined);

    await expect(
      ctx.service.cleanupActiveSession(
        undefined,
        true,
        async () => true,
        afterRemoval,
      ),
    ).rejects.toBe(epochError);

    expect(afterRemoval).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalledTimes(1);
  });

  it("does not run post-removal cleanup when a session record removal fails", async () => {
    const ctx = createContext();
    const removalError = new Error("session material removal failed");
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(removalError);
    const afterRemoval = vi.fn(async () => undefined);

    await expect(
      ctx.service.cleanupActiveSession(
        undefined,
        true,
        async () => true,
        afterRemoval,
      ),
    ).rejects.toBe(removalError);

    expect(afterRemoval).not.toHaveBeenCalled();
  });

  it("does not remove records or run post-removal cleanup for a stale action", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const afterRemoval = vi.fn(async () => undefined);

    await expect(
      ctx.service.cleanupActiveSession(
        undefined,
        false,
        async () => false,
        afterRemoval,
        undefined,
        { removeRecordsWhenUnavailableAfterAuthorization: true },
      ),
    ).resolves.toBe("stale_action");

    expect(afterRemoval).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("removes unavailable session records after an authenticated action", async () => {
    const ctx = createContext();
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    const afterRemoval = vi.fn(async () => undefined);

    await expect(
      ctx.service.cleanupActiveSession(
        undefined,
        false,
        async () => true,
        afterRemoval,
        undefined,
        { removeRecordsWhenUnavailableAfterAuthorization: true },
      ),
    ).resolves.toBe("session_unavailable");

    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
    expect(afterRemoval).not.toHaveBeenCalled();
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
    const material = createMaterial(ctx);

    ctx.ports.saved.unlockedVaultSessionMaterial = material;
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await expect(ctx.service.remove()).resolves.toBeUndefined();

    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
    for (const buffer of [
      material.vaultMasterKey,
      material.devicePrivateSignKey,
      material.devicePrivateVaultKey,
      material.deviceLocalProtectionKey,
      material.payloadKey,
    ]) {
      expect(Array.from(new Uint8Array(buffer))).toEqual([0]);
    }
  });

  it("restores a fresh session activated by another service after local removal", async () => {
    const ctx = createContext();
    const freshUnlockedVault = structuredClone(ctx.session.unlockedVault);
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await ctx.service.remove();

    const activatingService = new UnlockedVaultSessionService(
      ctx.ports.unlockedVaultSessionMaterialRepository,
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository,
      ctx.ports.crypto,
      ctx.ports.ids,
      ctx.ports.clipboardOperations,
    );
    vi.mocked(ctx.ports.ids.generateId)
      .mockReset()
      .mockResolvedValue("replacement-session-id");
    const activationAuthorization =
      await activatingService.requireVaultCanBeActivated(ctx.values.vaultId);
    await activatingService.activate(
      activationAuthorization,
      freshUnlockedVault,
      ctx.sourceSnapshotVersionVector,
    );

    await expect(ctx.service.get()).resolves.toMatchObject({
      sessionId: "replacement-session-id",
      unlockedVault: { vaultId: ctx.values.vaultId },
    });
    await expect(
      ctx.service.requireUnlockedVaultContext(
        ctx.values.vaultId,
        "test operation",
      ),
    ).resolves.toMatchObject({ sessionId: "replacement-session-id" });
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .evictCachedUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledWith(ctx.values.sessionId);
  });

  it("restores a fresh session after a successful empty removal", async () => {
    const ctx = createContext();
    const freshUnlockedVault = structuredClone(ctx.session.unlockedVault);

    await ctx.service.remove();

    const activatingService = new UnlockedVaultSessionService(
      ctx.ports.unlockedVaultSessionMaterialRepository,
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository,
      ctx.ports.crypto,
      ctx.ports.ids,
      ctx.ports.clipboardOperations,
    );
    vi.mocked(ctx.ports.ids.generateId)
      .mockReset()
      .mockResolvedValue("replacement-session-id");
    const activationAuthorization =
      await activatingService.requireVaultCanBeActivated(ctx.values.vaultId);
    await activatingService.activate(
      activationAuthorization,
      freshUnlockedVault,
      ctx.sourceSnapshotVersionVector,
    );

    await expect(ctx.service.get()).resolves.toMatchObject({
      sessionId: "replacement-session-id",
      unlockedVault: { vaultId: ctx.values.vaultId },
    });
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .evictCachedUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledWith(null);
  });

  it("does not revive an unknown session identity after removal fails", async () => {
    const ctx = createContext();
    const materialReadError = new Error("material read failed");
    const materialRemovalError = new Error("material removal failed");
    const payloadRemovalError = new Error("payload removal failed");
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(materialReadError);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(materialRemovalError);
    vi.mocked(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(payloadRemovalError);

    await expect(ctx.service.remove()).rejects.toBe(materialRemovalError);

    await expect(ctx.service.get()).resolves.toBeNull();
    await expect(ctx.service.get()).resolves.toBeNull();
    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeDefined();
    expect(ctx.ports.saved.encryptedUnlockedVaultSessionPayload).toBeDefined();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .evictCachedUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
  });

  it("does not revive the same session identity after removal fails", async () => {
    const ctx = createContext();
    const removalError = new Error("material removal failed");
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(removalError);

    await expect(ctx.service.remove()).rejects.toBe(removalError);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .evictCachedUnlockedVaultSessionMaterial,
    ).mockClear();

    await expect(ctx.service.get()).resolves.toBeNull();
    await expect(ctx.service.get()).resolves.toBeNull();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .evictCachedUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
  });

  it("continues direct removal when epoch revocation fails", async () => {
    const ctx = createContext();
    const epochError = new Error("session epoch unavailable");
    ctx.ports.saved.unlockedVaultSessionMaterial = createMaterial(ctx);
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .advanceUnlockedVaultSessionEpoch,
    ).mockRejectedValueOnce(epochError);

    await expect(ctx.service.remove()).rejects.toBe(epochError);

    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
  });

  it("rejects an expired coordination lease without mutating session state", async () => {
    const ctx = createContext();
    const material = createMaterial(ctx);
    ctx.ports.saved.unlockedVaultSessionMaterial = material;
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);
    let expiredLease!: ClipboardOperationLease;
    await ctx.ports.clipboardOperations.runExclusive(async (lease) => {
      expiredLease = lease;
    });

    await expect(ctx.service.remove(expiredLease)).rejects.toThrow(
      "Clipboard operation lease is not active for this coordinator.",
    );

    expect(ctx.ports.saved.unlockedVaultSessionMaterial).toBe(material);
    expect(ctx.ports.saved.encryptedUnlockedVaultSessionPayload).toBeDefined();
  });

  it("continues wiping and repository cleanup after a buffer cannot be wiped", async () => {
    const ctx = createContext();
    const detachedVaultMasterKey = new Uint8Array([2]).buffer;
    structuredClone(detachedVaultMasterKey, {
      transfer: [detachedVaultMasterKey],
    });
    const material = createMaterial(ctx, {
      vaultMasterKey:
        detachedVaultMasterKey as UnlockedVaultSessionMaterial["vaultMasterKey"],
    });
    ctx.ports.saved.unlockedVaultSessionMaterial = material;
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload =
      createEncryptedPayload(ctx);

    await expect(ctx.service.remove()).resolves.toBeUndefined();

    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalledTimes(1);
    expect(Array.from(new Uint8Array(material.devicePrivateSignKey))).toEqual([
      0,
    ]);
  });

  it("removes encrypted payload when material removal fails", async () => {
    const ctx = createContext();
    const error = new Error("material remove failed");
    const material = createMaterial(ctx);

    ctx.ports.saved.unlockedVaultSessionMaterial = material;
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
    for (const buffer of [
      material.vaultMasterKey,
      material.devicePrivateSignKey,
      material.devicePrivateVaultKey,
      material.deviceLocalProtectionKey,
      material.payloadKey,
    ]) {
      expect(Array.from(new Uint8Array(buffer))).toEqual([0]);
    }
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
