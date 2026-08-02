import { describe, expect, it } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import type { RawMasterPassword } from "../../domain/master-password";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
import { CreateDeviceEnrollmentRequestUseCase } from "./create-device-enrollment-request";

describe("CreateDeviceEnrollmentRequestUseCase", () => {
  it("rejects a weak password before generating the request identity", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const useCase = new CreateDeviceEnrollmentRequestUseCase(
      ports.crypto,
      ports.ids,
      ports.vaultLocalRepository,
    );

    await expect(
      useCase.execute({
        vaultId: values.vaultId,
        expectedGenesisCertificateDigest:
          values.vaultTrustAnchor.genesisCertificateDigest,
        masterPassword: "Password1234567!" as RawMasterPassword,
      }),
    ).rejects.toBeInstanceOf(InvalidNewMasterPasswordError);

    expect(ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ports.vaultLocalRepository.savePendingDeviceEnrollment,
    ).not.toHaveBeenCalled();
  });

  it("accepts a strong password at the minimum length", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const useCase = new CreateDeviceEnrollmentRequestUseCase(
      ports.crypto,
      ports.ids,
      ports.vaultLocalRepository,
    );
    const masterPassword = "vN7#qL2!xP9@rT4$" as RawMasterPassword;

    await useCase.execute({
      vaultId: values.vaultId,
      expectedGenesisCertificateDigest:
        values.vaultTrustAnchor.genesisCertificateDigest,
      masterPassword,
    });

    expect(ports.crypto.deriveLocalRootKey).toHaveBeenCalledWith(
      masterPassword,
      values.masterPasswordSalt,
    );
  });

  it("stores private request state locally and returns only the signed public request", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const useCase = new CreateDeviceEnrollmentRequestUseCase(
      ports.crypto,
      ports.ids,
      ports.vaultLocalRepository,
    );

    const request = await useCase.execute({
      vaultId: values.vaultId,
      expectedGenesisCertificateDigest:
        values.vaultTrustAnchor.genesisCertificateDigest,
      masterPassword: values.masterPassword,
    });

    expect(request.payload).toMatchObject({
      vaultId: values.vaultId,
      expectedGenesisCertificateDigest:
        values.vaultTrustAnchor.genesisCertificateDigest,
      publicSignKey: values.devicePublicSignKey,
      publicVaultKey: values.devicePublicVaultKey,
    });
    expect(ports.saved.pendingDeviceEnrollment).toMatchObject({
      vaultId: values.vaultId,
      protectedPrivateState: values.protectedPendingDeviceEnrollment,
    });
    expect(request).not.toHaveProperty("devicePrivateSignKey");
    expect(request).not.toHaveProperty("devicePrivateVaultKey");
    expect(request).not.toHaveProperty("deviceLocalProtectionKey");
  });
});
