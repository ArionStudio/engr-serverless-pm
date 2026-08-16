import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultSessionWithEntries } from "../../__tests__/fixtures/vault-entries";
import type { UnlockedVaultSessionMaterial } from "../../domain/session/unlocked-vault-session.type";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/session/unlocked-vault-session-material-repository.port";
import { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { GetVaultSessionStatusUseCase } from "./get-vault-session-status";

describe("GetVaultSessionStatusUseCase", () => {
  function createContext() {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const useCase = new GetVaultSessionStatusUseCase(
      ports.sessionServices.unlockedVaultSession,
    );

    return {
      values,
      ports,
      saved: ports.saved,
      useCase,
    };
  }

  it("returns locked status when there is no unlocked vault", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute();

    expect(result).toEqual({
      status: "locked",
    });
  });

  it("returns unlocked status for the active vault", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = createUnlockedVaultSessionWithEntries(
      ctx.values,
      [],
    );

    const result = await ctx.useCase.execute();

    expect(result).toEqual({
      status: "unlocked",
      vaultId: ctx.values.vaultId,
    });
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .getEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("bubbles session material repository errors", async () => {
    const ctx = createContext();
    const error = new Error("session read failed");

    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getPersistedUnlockedVaultSessionIdentity,
    ).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);
  });

  it("does not report the same invalidated session after removal fails", async () => {
    const ctx = createContext();
    const removalError = new Error("session removal failed");
    ctx.saved.unlockedVaultSession = createUnlockedVaultSessionWithEntries(
      ctx.values,
      [],
    );
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(removalError);

    await expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove(),
    ).rejects.toBe(removalError);
    await expect(ctx.useCase.execute()).resolves.toEqual({ status: "locked" });
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .getEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.decryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it.each(["lock", "replacement"] as const)(
    "reconciles a remote %s without reading the encrypted payload",
    async (transition) => {
      const values = createCoreTestValues();
      const ports = createCoreTestPorts(values);
      const readerRepository = createCachingMaterialRepository(
        ports.unlockedVaultSessionMaterialRepository,
      );
      const writerRepository = createCachingMaterialRepository(
        ports.unlockedVaultSessionMaterialRepository,
      );
      const readerSession = new UnlockedVaultSessionService(
        readerRepository.repository,
        ports.encryptedUnlockedVaultSessionPayloadRepository,
        ports.crypto,
        ports.ids,
        ports.clipboardOperations,
      );
      const status = new GetVaultSessionStatusUseCase(readerSession);
      ports.saved.unlockedVaultSession = createUnlockedVaultSessionWithEntries(
        values,
        [],
      );

      await expect(status.execute()).resolves.toEqual({
        status: "unlocked",
        vaultId: values.vaultId,
      });
      const staleMaterial = readerRepository.getCachedMaterial();

      if (staleMaterial === undefined || staleMaterial === null) {
        throw new Error(
          "Expected the status reader to cache session material.",
        );
      }

      if (transition === "lock") {
        await writerRepository.repository.removeUnlockedVaultSessionMaterial();
      } else {
        await writerRepository.repository.saveUnlockedVaultSessionMaterial({
          ...structuredClone(staleMaterial),
          sessionId: "replacement-session-id",
          vaultId: "replacement-vault-id",
        });
      }

      vi.mocked(
        ports.encryptedUnlockedVaultSessionPayloadRepository
          .getEncryptedUnlockedVaultSessionPayload,
      ).mockClear();
      vi.mocked(ports.crypto.decryptUnlockedVaultSessionPayload).mockClear();

      await expect(status.execute()).resolves.toEqual(
        transition === "lock"
          ? { status: "locked" }
          : { status: "unlocked", vaultId: "replacement-vault-id" },
      );
      for (const secret of [
        staleMaterial.vaultMasterKey,
        staleMaterial.devicePrivateSignKey,
        staleMaterial.devicePrivateVaultKey,
        staleMaterial.deviceLocalProtectionKey,
        staleMaterial.payloadKey,
      ]) {
        expect(Array.from(new Uint8Array(secret))).toEqual([0]);
      }
      expect(
        ports.encryptedUnlockedVaultSessionPayloadRepository
          .getEncryptedUnlockedVaultSessionPayload,
      ).not.toHaveBeenCalled();
      expect(
        ports.crypto.decryptUnlockedVaultSessionPayload,
      ).not.toHaveBeenCalled();
    },
  );

  it("evicts cached absence when another repository persists an active session", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const readerRepository = createCachingMaterialRepository(
      ports.unlockedVaultSessionMaterialRepository,
    );
    const writerRepository = createCachingMaterialRepository(
      ports.unlockedVaultSessionMaterialRepository,
    );
    const readerSession = new UnlockedVaultSessionService(
      readerRepository.repository,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      ports.clipboardOperations,
    );
    const status = new GetVaultSessionStatusUseCase(readerSession);
    ports.saved.unlockedVaultSession = createUnlockedVaultSessionWithEntries(
      values,
      [],
    );
    const material = ports.saved.unlockedVaultSessionMaterial;

    if (material === undefined) {
      throw new Error("Expected persisted session material fixture.");
    }

    ports.saved.unlockedVaultSession = undefined;
    await expect(status.execute()).resolves.toEqual({ status: "locked" });
    expect(readerRepository.getCachedMaterial()).toBeNull();

    await writerRepository.repository.saveUnlockedVaultSessionMaterial(
      material,
    );
    vi.mocked(
      ports.encryptedUnlockedVaultSessionPayloadRepository
        .getEncryptedUnlockedVaultSessionPayload,
    ).mockClear();
    vi.mocked(ports.crypto.decryptUnlockedVaultSessionPayload).mockClear();

    await expect(status.execute()).resolves.toEqual({
      status: "unlocked",
      vaultId: values.vaultId,
    });
    expect(readerRepository.getCachedMaterial()).toBeUndefined();
    expect(
      ports.encryptedUnlockedVaultSessionPayloadRepository
        .getEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(
      ports.crypto.decryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });
});

function createCachingMaterialRepository(
  sharedRepository: UnlockedVaultSessionMaterialRepositoryPort,
) {
  let cachedMaterial: UnlockedVaultSessionMaterial | null | undefined;

  const repository: UnlockedVaultSessionMaterialRepositoryPort = {
    ...sharedRepository,
    saveUnlockedVaultSessionMaterial: vi.fn(async (material) => {
      await sharedRepository.saveUnlockedVaultSessionMaterial(material);
      cachedMaterial = material;
    }),
    getUnlockedVaultSessionMaterial: vi.fn(async () => {
      if (cachedMaterial !== undefined) {
        return cachedMaterial;
      }

      const material = await sharedRepository.getUnlockedVaultSessionMaterial();
      cachedMaterial = material === null ? null : structuredClone(material);
      return cachedMaterial;
    }),
    evictCachedUnlockedVaultSessionMaterial: vi.fn(async (sessionId) => {
      if (
        cachedMaterial === null ||
        (sessionId !== null && cachedMaterial?.sessionId === sessionId)
      ) {
        cachedMaterial = undefined;
      }
    }),
    removeUnlockedVaultSessionMaterial: vi.fn(async () => {
      try {
        await sharedRepository.removeUnlockedVaultSessionMaterial();
      } finally {
        cachedMaterial = null;
      }
    }),
  };

  return {
    repository,
    getCachedMaterial: () => cachedMaterial,
  };
}
