import { describe, expect, it } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { CreateDeviceEnrollmentRequestUseCase } from "./create-device-enrollment-request";

describe("CreateDeviceEnrollmentRequestUseCase", () => {
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
