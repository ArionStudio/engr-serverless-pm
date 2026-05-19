import { describe, expect, it } from "vitest";
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { PasswordEntryNotFoundError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import { RevealEntryPasswordUseCase } from "./reveal-entry-password";

const entry: PasswordEntry = {
  id: "entry-1",
  password: "secret-password",
  login: "user@example.com",
  tags: [1],
  sanitizedUrl: "https://example.com/login",
};

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  ports.saved.unlockedVault = {
    vaultId: values.vaultId,
    deviceId: values.deviceId,
    vault: {
      ...values.decryptedVault,
      entries: [entry],
    },
    vaultMasterKey: values.vaultMasterKey,
    devicePrivateSignKey: values.devicePrivateSignKey,
  };

  return {
    values,
    ports,
    saved: ports.saved,
    useCase: new RevealEntryPasswordUseCase(ports.unlockedVaultRepository),
  };
}

describe("RevealEntryPasswordUseCase", () => {
  it("reveals password for an unlocked vault entry", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: entry.id,
      }),
    ).resolves.toEqual({
      password: entry.password,
    });
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVault = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: entry.id,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
  });

  it("fails when requested entry does not exist", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: "missing-entry",
      }),
    ).rejects.toBeInstanceOf(PasswordEntryNotFoundError);
  });
});
