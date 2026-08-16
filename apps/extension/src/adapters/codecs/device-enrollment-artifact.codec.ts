import {
  CURRENT_ALGORITHM_SUITE,
  type DeviceEnrollmentPrivateState,
  type DeviceEnrollmentRequest,
  type DeviceEnrollmentResponse,
  type DeviceLocalProtectionKey,
  type DevicePrivateSignKey,
  type DevicePublicSignKey,
  type DeviceVaultPrivateKey,
  type DeviceVaultPublicKey,
  type PendingDeviceEnrollment,
  type RandomBytes,
} from "@lfspm/core";
import { bestEffortWipeArrayBuffers } from "@lfspm/core/lib";
import {
  StaticArtifactError,
  canonicalDigest,
  decodeCanonicalBytes,
  decodeSignature,
  decodeWrapped,
  encodeBytes,
  encodeSignature,
  encodeWrapped,
  exactRecord,
  nonBlankString,
} from "./artifact-codec.primitives";
import {
  decodeTrustAnchor,
  decodeVaultSnapshot,
  encodeTrustAnchor,
  encodeVaultSnapshot,
} from "./vault-snapshot.codec";

export class InvalidDeviceEnrollmentArtifactError extends StaticArtifactError {
  constructor() {
    super(
      "InvalidDeviceEnrollmentArtifactError",
      "Device enrollment artifact is malformed.",
    );
  }
}

export class InvalidDeviceEnrollmentPrivateStateError extends StaticArtifactError {
  constructor() {
    super(
      "InvalidDeviceEnrollmentPrivateStateError",
      "Device enrollment private state is malformed.",
    );
  }
}

function decodeEnrollmentRequestInner(value: unknown): DeviceEnrollmentRequest {
  const record = exactRecord(value, ["payload", "signature"]);
  const payload = exactRecord(record.payload, [
    "version",
    "requestId",
    "vaultId",
    "expectedGenesisCertificateDigest",
    "deviceId",
    "algorithmSuiteId",
    "publicSignKey",
    "publicVaultKey",
  ]);
  if (payload.version !== 1) {
    throw new Error("version");
  }
  return {
    payload: {
      version: 1,
      requestId: nonBlankString(payload.requestId),
      vaultId: nonBlankString(payload.vaultId),
      expectedGenesisCertificateDigest: canonicalDigest(
        payload.expectedGenesisCertificateDigest,
      ),
      deviceId: nonBlankString(payload.deviceId),
      algorithmSuiteId: nonBlankString(payload.algorithmSuiteId),
      publicSignKey: decodeCanonicalBytes<DevicePublicSignKey>(
        payload.publicSignKey,
        CURRENT_ALGORITHM_SUITE.signing.publicKeyLengthBytes,
      ),
      publicVaultKey: decodeCanonicalBytes<DeviceVaultPublicKey>(
        payload.publicVaultKey,
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.publicKeyLengthBytes,
      ),
    },
    signature: decodeSignature(record.signature),
  };
}

export function decodeDeviceEnrollmentRequest(
  value: unknown,
): DeviceEnrollmentRequest {
  try {
    return decodeEnrollmentRequestInner(value);
  } catch {
    throw new InvalidDeviceEnrollmentArtifactError();
  }
}

export function encodeDeviceEnrollmentRequest(
  value: DeviceEnrollmentRequest,
): unknown {
  return {
    payload: {
      ...value.payload,
      publicSignKey: encodeBytes(value.payload.publicSignKey),
      publicVaultKey: encodeBytes(value.payload.publicVaultKey),
    },
    signature: encodeSignature(value.signature),
  };
}

export function decodeDeviceEnrollmentResponse(
  value: unknown,
): DeviceEnrollmentResponse {
  try {
    const record = exactRecord(value, [
      "version",
      "requestId",
      "vaultId",
      "vaultTrustAnchor",
      "snapshot",
    ]);
    if (record.version !== 1) {
      throw new Error("version");
    }
    const snapshot = decodeVaultSnapshot(record.snapshot, "remote");
    const vaultId = nonBlankString(record.vaultId);
    const vaultTrustAnchor = decodeTrustAnchor(record.vaultTrustAnchor);
    if (
      snapshot.metadata.id !== vaultId ||
      vaultTrustAnchor.vaultId !== vaultId
    ) {
      throw new Error("vault");
    }
    return {
      version: 1,
      requestId: nonBlankString(record.requestId),
      vaultId,
      vaultTrustAnchor,
      snapshot,
    };
  } catch {
    throw new InvalidDeviceEnrollmentArtifactError();
  }
}

export function encodeDeviceEnrollmentResponse(
  value: DeviceEnrollmentResponse,
): unknown {
  return {
    version: value.version,
    requestId: value.requestId,
    vaultId: value.vaultId,
    vaultTrustAnchor: encodeTrustAnchor(value.vaultTrustAnchor),
    snapshot: encodeVaultSnapshot(value.snapshot),
  };
}

export function decodePendingDeviceEnrollment(
  value: unknown,
): PendingDeviceEnrollment {
  try {
    const record = exactRecord(value, [
      "requestId",
      "vaultId",
      "deviceId",
      "algorithmSuiteId",
      "masterPasswordSalt",
      "localKeysProtectionSalt",
      "protectedPrivateState",
    ]);
    return {
      requestId: nonBlankString(record.requestId),
      vaultId: nonBlankString(record.vaultId),
      deviceId: nonBlankString(record.deviceId),
      algorithmSuiteId: nonBlankString(record.algorithmSuiteId),
      masterPasswordSalt: decodeCanonicalBytes<RandomBytes>(
        record.masterPasswordSalt,
        32,
      ),
      localKeysProtectionSalt: decodeCanonicalBytes<RandomBytes>(
        record.localKeysProtectionSalt,
        32,
      ),
      protectedPrivateState: decodeWrapped(record.protectedPrivateState),
    };
  } catch {
    throw new InvalidDeviceEnrollmentArtifactError();
  }
}

export function encodePendingDeviceEnrollment(
  value: PendingDeviceEnrollment,
): unknown {
  return {
    ...value,
    masterPasswordSalt: encodeBytes(value.masterPasswordSalt),
    localKeysProtectionSalt: encodeBytes(value.localKeysProtectionSalt),
    protectedPrivateState: encodeWrapped(value.protectedPrivateState),
  };
}

export function decodeDeviceEnrollmentPrivateState(
  value: unknown,
): DeviceEnrollmentPrivateState {
  let devicePrivateSignKey: DevicePrivateSignKey | undefined;
  let devicePrivateVaultKey: DeviceVaultPrivateKey | undefined;
  let deviceLocalProtectionKey: DeviceLocalProtectionKey | undefined;
  try {
    const record = exactRecord(value, [
      "request",
      "devicePrivateSignKey",
      "devicePrivateVaultKey",
      "deviceLocalProtectionKey",
    ]);
    const request = decodeEnrollmentRequestInner(record.request);
    devicePrivateSignKey = decodeCanonicalBytes<DevicePrivateSignKey>(
      record.devicePrivateSignKey,
      CURRENT_ALGORITHM_SUITE.signing.privateKeyLengthBytes,
    );
    devicePrivateVaultKey = decodeCanonicalBytes<DeviceVaultPrivateKey>(
      record.devicePrivateVaultKey,
      CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.privateKeyLengthBytes,
    );
    deviceLocalProtectionKey = decodeCanonicalBytes<DeviceLocalProtectionKey>(
      record.deviceLocalProtectionKey,
      32,
    );
    return {
      request,
      devicePrivateSignKey,
      devicePrivateVaultKey,
      deviceLocalProtectionKey,
    };
  } catch {
    bestEffortWipeArrayBuffers([
      devicePrivateSignKey,
      devicePrivateVaultKey,
      deviceLocalProtectionKey,
    ]);
    throw new InvalidDeviceEnrollmentPrivateStateError();
  }
}

export function encodeDeviceEnrollmentPrivateState(
  value: DeviceEnrollmentPrivateState,
): unknown {
  return {
    request: encodeDeviceEnrollmentRequest(value.request),
    devicePrivateSignKey: encodeBytes(value.devicePrivateSignKey),
    devicePrivateVaultKey: encodeBytes(value.devicePrivateVaultKey),
    deviceLocalProtectionKey: encodeBytes(value.deviceLocalProtectionKey),
  };
}
