import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createUnlockedVaultSessionWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import type { UnlockedVaultSessionMaterial } from "../../domain/vault/unlocked-vault-session";
import { ActiveUnlockedVaultMismatchError } from "../__errors/vault-session.errors";
import { ProtectUnlockedVaultSessionUseCase } from "./protect-unlocked-vault-session";
import { SaveUnlockedVaultSessionUseCase } from "./save-unlocked-vault-session";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const session = createUnlockedVaultSessionWithEntries(
    values,
    [singlePasswordEntry],
    [],
    7,
  );
  const protectUnlockedVaultSession = new ProtectUnlockedVaultSessionUseCase(
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
    useCase: new SaveUnlockedVaultSessionUseCase(
      ports.unlockedVaultSessionMaterialRepository,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      protectUnlockedVaultSession,
    ),
  };
}

function createActiveMaterial(
  ctx: ReturnType<typeof createContext>,
  vaultId = ctx.values.vaultId,
): UnlockedVaultSessionMaterial {
  return {
    sessionId: "active-session-id",
    vaultId,
    sourceSnapshotRevision: 6,
    deviceId: ctx.values.deviceId,
    vaultMasterKey: ctx.values.vaultMasterKey,
    devicePrivateSignKey: ctx.values.devicePrivateSignKey,
    payloadKey: ctx.values.unlockedVaultSessionPayloadKey,
  };
}

describe("SaveUnlockedVaultSessionUseCase", () => {
  it("protects and saves a new unlocked vault session", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      session: ctx.session,
    });

    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).toHaveBeenCalled();
    expect(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).toHaveBeenCalled();
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
  });

  it("updates the active session when the same vault is already active", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(ctx);

    await ctx.useCase.execute({
      session: ctx.session,
    });

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

  it("rejects saving a different vault while another vault is active", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(
      ctx,
      "other-vault-id",
    );

    await expect(
      ctx.useCase.execute({
        session: ctx.session,
      }),
    ).rejects.toBeInstanceOf(ActiveUnlockedVaultMismatchError);

    expect(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .saveEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("does not save material when encrypted payload save fails", async () => {
    const ctx = createContext();
    const error = new Error("payload save failed");

    vi.mocked(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .saveEncryptedUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        session: ctx.session,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
  });

  it("saves encrypted payload before session material for a new session", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      session: ctx.session,
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

  it("saves session material before encrypted payload for an active session", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = createActiveMaterial(ctx);

    await ctx.useCase.execute({
      session: ctx.session,
    });

    expect(
      vi.mocked(
        ctx.ports.unlockedVaultSessionMaterialRepository
          .saveUnlockedVaultSessionMaterial,
      ).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(
        ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
          .saveEncryptedUnlockedVaultSessionPayload,
      ).mock.invocationCallOrder[0],
    );
  });
});
