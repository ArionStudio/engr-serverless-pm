import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultSessionWithEntries } from "../../__tests__/fixtures/vault-entries";
import { GetVaultSessionStatusUseCase } from "./get-vault-session-status";

describe("GetVaultSessionStatusUseCase", () => {
  function createContext() {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const useCase = new GetVaultSessionStatusUseCase(
      ports.unlockedVaultSessionMaterialRepository,
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
        .getUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);
  });
});
