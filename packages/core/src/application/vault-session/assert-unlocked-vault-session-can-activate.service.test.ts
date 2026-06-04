import { describe, expect, it } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import type { UnlockedVaultSessionMaterial } from "../../domain/vault/unlocked-vault-session";
import { ActiveUnlockedVaultMismatchError } from "../../use-cases/__errors/vault-session.errors";
import { AssertUnlockedVaultSessionCanActivateService } from "./assert-unlocked-vault-session-can-activate.service";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const activeMaterial: UnlockedVaultSessionMaterial = {
    sessionId: values.sessionId,
    vaultId: values.vaultId,
    sourceSnapshotRevision: 7,
    deviceId: values.deviceId,
    vaultMasterKey: values.vaultMasterKey,
    devicePrivateSignKey: values.devicePrivateSignKey,
    payloadKey: values.unlockedVaultSessionPayloadKey,
  };

  return {
    values,
    ports,
    activeMaterial,
    service: new AssertUnlockedVaultSessionCanActivateService(
      ports.unlockedVaultSessionMaterialRepository,
    ),
  };
}

describe("AssertUnlockedVaultSessionCanActivateService", () => {
  it("allows activation when no vault is active", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.assertCanActivate(ctx.values.vaultId),
    ).resolves.toBeUndefined();
  });

  it("allows activation for the active vault", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = ctx.activeMaterial;

    await expect(
      ctx.service.assertCanActivate(ctx.values.vaultId),
    ).resolves.toBeUndefined();
  });

  it("rejects activation when another vault is active", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSessionMaterial = ctx.activeMaterial;

    await expect(
      ctx.service.assertCanActivate("other-vault-id"),
    ).rejects.toBeInstanceOf(ActiveUnlockedVaultMismatchError);
  });
});
