import { describe, expect, it } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSessionMaterial,
} from "../../domain/vault/unlocked-vault-session";
import { UnlockedVaultSessionInvalidError } from "../errors/vault-session.errors";
import { GetUnlockedVaultSessionService } from "./get-unlocked-vault-session.service";
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
  const restoreUnlockedVaultSession = new RestoreUnlockedVaultSessionService(
    ports.crypto,
  );

  return {
    values,
    ports,
    material,
    encryptedPayload,
    service: new GetUnlockedVaultSessionService(
      ports.unlockedVaultSessionMaterialRepository,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      restoreUnlockedVaultSession,
    ),
  };
}

describe("GetUnlockedVaultSessionService", () => {
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
    ctx.ports.saved.unlockedVaultSessionMaterial = ctx.material;
    ctx.ports.saved.encryptedUnlockedVaultSessionPayload = ctx.encryptedPayload;

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
  });

  it("fails when session material exists without an encrypted payload", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = ctx.material;

    await expect(ctx.service.get()).rejects.toBeInstanceOf(
      UnlockedVaultSessionInvalidError,
    );
  });
});
