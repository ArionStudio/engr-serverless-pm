import { describe, expect, it } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { saveUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { ReadDeviceManagementUseCase } from "./read-device-management";

describe("ReadDeviceManagementUseCase", () => {
  it("projects only public identity fields from the verified session", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    saveUnlockedVaultWithEntries(ports, values, []);
    const result = await new ReadDeviceManagementUseCase(
      ports.sessionServices.unlockedVaultSession,
    ).execute({ vaultId: values.vaultId });
    expect(result).toEqual({
      vaultId: values.vaultId,
      currentDeviceId: values.deviceId,
      syncConfigured: false,
      genesisCertificateDigest: expect.any(String),
      devices: [
        { id: values.deviceId, name: expect.any(String), state: "current" },
      ],
    });
  });
  it("requires the matching vault to remain unlocked", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    await expect(
      new ReadDeviceManagementUseCase(
        ports.sessionServices.unlockedVaultSession,
      ).execute({ vaultId: values.vaultId }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
  });
});
