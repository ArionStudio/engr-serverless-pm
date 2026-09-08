import type { DeviceEnrollmentResponse } from "../../domain/device-trust";
import type { RawMasterPassword } from "../../domain/master-password";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceEnrollmentIntegrityError,
  DeviceEnrollmentSnapshotMismatchError,
  PendingDeviceEnrollmentMismatchError,
  PendingDeviceEnrollmentNotFoundError,
} from "../../errors/device-enrollment.errors";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";
import type { VaultTrustService } from "../trust/vault-trust.service";

// Verifies the approval against this browser's password-protected request.
// The caller owns the returned secret buffers and must wipe them when unused.
export class DeviceEnrollmentApprovalService {
  private readonly crypto: CryptoPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly vaultTrust: VaultTrustService;
  constructor(
    crypto: CryptoPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
    vaultTrust: VaultTrustService,
  ) {
    this.crypto = crypto;
    this.vaultLocalRepository = vaultLocalRepository;
    this.vaultTrust = vaultTrust;
  }

  async open(
    response: DeviceEnrollmentResponse,
    masterPassword: RawMasterPassword,
  ) {
    const pending = await this.vaultLocalRepository.getPendingDeviceEnrollment(
      response.requestId,
    );

    if (pending === null) {
      throw new PendingDeviceEnrollmentNotFoundError(response.requestId);
    }

    if (
      response.version !== 1 ||
      pending.requestId !== response.requestId ||
      pending.vaultId !== response.vaultId ||
      pending.algorithmSuiteId !== this.crypto.algorithmSuite.id
    ) {
      throw new PendingDeviceEnrollmentMismatchError(response.requestId);
    }

    const ephemeralSecrets: ArrayBuffer[] = [];
    const sessionSecrets: ArrayBuffer[] = [];
    try {
      const localRootKey = await this.crypto.deriveLocalRootKey(
        masterPassword,
        pending.masterPasswordSalt,
      );
      ephemeralSecrets.push(localRootKey);
      const pendingProtectionKey =
        await this.crypto.deriveDeviceEnrollmentPrivateStateProtectionKey(
          localRootKey,
          pending.localKeysProtectionSalt,
        );
      ephemeralSecrets.push(pendingProtectionKey);
      const privateState = await this.crypto.unwrapDeviceEnrollmentPrivateState(
        pending.protectedPrivateState,
        pendingProtectionKey,
      );
      sessionSecrets.push(
        privateState.devicePrivateSignKey,
        privateState.devicePrivateVaultKey,
        privateState.deviceLocalProtectionKey,
      );
      const request = privateState.request;

      if (
        request.payload.requestId !== response.requestId ||
        request.payload.vaultId !== response.vaultId ||
        request.payload.deviceId !== pending.deviceId ||
        !(await this.crypto.verifyDeviceEnrollmentRequestSignature(request)) ||
        !(await this.crypto.verifyDeviceSignKeyPair(
          request.payload.publicSignKey,
          privateState.devicePrivateSignKey,
        )) ||
        !(await this.crypto.verifyDeviceVaultKeyPair(
          request.payload.publicVaultKey,
          privateState.devicePrivateVaultKey,
        ))
      ) {
        throw new PendingDeviceEnrollmentMismatchError(response.requestId);
      }

      const authorizedSnapshot = response.snapshot;

      if (authorizedSnapshot.metadata.id !== response.vaultId) {
        throw new DeviceEnrollmentSnapshotMismatchError(
          response.vaultId,
          authorizedSnapshot.metadata.id,
        );
      }

      if (
        authorizedSnapshot.metadata.schemaVersion !== 1 ||
        authorizedSnapshot.metadata.algorithmSuiteId !==
          this.crypto.algorithmSuite.id
      ) {
        throw new UnsupportedAlgorithmSuiteError({
          vaultId: response.vaultId,
          artifact: "device enrollment snapshot",
          expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
          actualAlgorithmSuiteId: authorizedSnapshot.metadata.algorithmSuiteId,
        });
      }

      if (
        response.vaultTrustAnchor.genesisCertificateDigest !==
        request.payload.expectedGenesisCertificateDigest
      ) {
        throw new DeviceEnrollmentIntegrityError(
          response.vaultId,
          "response trust anchor does not match the enrollment request",
        );
      }

      const verifiedTrust = await this.vaultTrust.verifyTrustChain(
        response.vaultId,
        response.vaultTrustAnchor,
        authorizedSnapshot.trustChain,
      );
      await this.vaultTrust.verifySnapshot(
        response.vaultId,
        authorizedSnapshot,
        verifiedTrust,
      );

      const targetIdentity = verifiedTrust.trustedDevices.find(
        (device) => device.deviceId === request.payload.deviceId,
      );
      const targetSlots = authorizedSnapshot.keySlots.deviceSlots.filter(
        (slot) => slot.deviceId === request.payload.deviceId,
      );

      if (
        targetIdentity === undefined ||
        targetSlots.length !== 1 ||
        (await this.crypto.digestDevicePublicSignKey(
          targetIdentity.publicSignKey,
        )) !==
          (await this.crypto.digestDevicePublicSignKey(
            request.payload.publicSignKey,
          )) ||
        (await this.crypto.digestDevicePublicVaultKey(
          targetIdentity.publicVaultKey,
        )) !==
          (await this.crypto.digestDevicePublicVaultKey(
            request.payload.publicVaultKey,
          ))
      ) {
        throw new DeviceEnrollmentIntegrityError(
          response.vaultId,
          "target identity or vault key envelope does not match the request",
        );
      }

      const targetSlot = targetSlots[0];
      const vaultMasterKey = await this.crypto.openDeviceVaultKeyEnvelope(
        targetSlot.envelope,
        privateState.devicePrivateVaultKey,
        {
          vaultId: response.vaultId,
          deviceId: request.payload.deviceId,
          vaultKeyGeneration: authorizedSnapshot.metadata.vaultKeyGeneration,
          algorithmSuiteId: authorizedSnapshot.metadata.algorithmSuiteId,
        },
      );
      sessionSecrets.push(vaultMasterKey);
      const authorizedVault = await this.crypto.decryptVaultSnapshotContent(
        authorizedSnapshot.content,
        vaultMasterKey,
      );
      return {
        privateState,
        request,
        authorizedSnapshot,
        verifiedTrust,
        vaultMasterKey,
        authorizedVault,
        secrets: sessionSecrets,
      };
    } catch (cause) {
      bestEffortWipeArrayBuffers(sessionSecrets);
      throw cause;
    } finally {
      bestEffortWipeArrayBuffers(ephemeralSecrets);
    }
  }
}
