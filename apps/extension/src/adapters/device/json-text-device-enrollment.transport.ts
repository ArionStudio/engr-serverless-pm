import type {
  DeviceEnrollmentRequest,
  DeviceEnrollmentResponse,
} from "@lfspm/core";
import {
  WebCryptoAsymmetricKeyValidator,
  validateVaultSnapshotPublicKeys,
  type AsymmetricKeyValidator,
} from "../crypto";
import {
  InvalidDeviceEnrollmentArtifactError,
  decodeDeviceEnrollmentRequest,
  decodeDeviceEnrollmentResponse,
  encodeDeviceEnrollmentRequest,
  encodeDeviceEnrollmentResponse,
} from "../codecs/device-enrollment-artifact.codec";

export class JsonTextDeviceEnrollmentTransport {
  private readonly asymmetricKeyValidator: AsymmetricKeyValidator;

  constructor(
    asymmetricKeyValidator: AsymmetricKeyValidator = new WebCryptoAsymmetricKeyValidator(),
  ) {
    this.asymmetricKeyValidator = asymmetricKeyValidator;
  }

  serializeDeviceEnrollmentRequest(request: DeviceEnrollmentRequest): string {
    try {
      return JSON.stringify(encodeDeviceEnrollmentRequest(request));
    } catch {
      throw new InvalidDeviceEnrollmentArtifactError();
    }
  }

  async parseDeviceEnrollmentRequest(
    serialized: string,
  ): Promise<DeviceEnrollmentRequest> {
    try {
      const parsed: unknown = JSON.parse(serialized);
      const request = decodeDeviceEnrollmentRequest(parsed);

      await Promise.all([
        this.asymmetricKeyValidator.importDeviceSignPublicKey(
          request.payload.publicSignKey,
        ),
        this.asymmetricKeyValidator.importDeviceVaultPublicKey(
          request.payload.publicVaultKey,
        ),
      ]);

      return request;
    } catch {
      throw new InvalidDeviceEnrollmentArtifactError();
    }
  }

  serializeDeviceEnrollmentResponse(
    response: DeviceEnrollmentResponse,
  ): string {
    try {
      return JSON.stringify(encodeDeviceEnrollmentResponse(response));
    } catch {
      throw new InvalidDeviceEnrollmentArtifactError();
    }
  }

  async parseDeviceEnrollmentResponse(
    serialized: string,
  ): Promise<DeviceEnrollmentResponse> {
    try {
      const parsed: unknown = JSON.parse(serialized);
      const response = decodeDeviceEnrollmentResponse(parsed);

      await Promise.all([
        this.asymmetricKeyValidator.importDeviceSignPublicKey(
          response.vaultTrustAnchor.genesisPublicSignKey,
        ),
        validateVaultSnapshotPublicKeys(
          response.snapshot,
          this.asymmetricKeyValidator,
        ),
      ]);

      return response;
    } catch {
      throw new InvalidDeviceEnrollmentArtifactError();
    }
  }
}
