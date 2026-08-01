import type {
  DeviceEnrollmentRequest,
  DeviceEnrollmentResponse,
} from "../../domain/device-trust";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import { DeviceEnrollmentIntegrityError } from "../../errors/device-enrollment.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../../services/sync";
import { VaultTrustService } from "../../services/trust/vault-trust.service";

export type InitializeDeviceEnrollmentCommandParams = {
  readonly vaultId: string;
  readonly request: DeviceEnrollmentRequest;
};

export class InitializeDeviceEnrollmentUseCase {
  private readonly crypto: CryptoPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    crypto: CryptoPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncGuard: VaultSyncGuardService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.crypto = crypto;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncGuard = vaultSyncGuard;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async execute(
    params: InitializeDeviceEnrollmentCommandParams,
  ): Promise<DeviceEnrollmentResponse> {
    const { request } = params;

    if (
      request.payload.version !== 1 ||
      request.payload.vaultId !== params.vaultId
    ) {
      throw new DeviceEnrollmentIntegrityError(
        params.vaultId,
        "request identity does not match the vault",
      );
    }

    if (request.payload.algorithmSuiteId !== this.crypto.algorithmSuite.id) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId: params.vaultId,
        artifact: "device enrollment request",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: request.payload.algorithmSuiteId,
      });
    }

    if (!(await this.crypto.verifyDeviceEnrollmentRequestSignature(request))) {
      throw new DeviceEnrollmentIntegrityError(
        params.vaultId,
        "request self-signature is invalid",
      );
    }

    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "authorize device enrollment",
      );
    const syncState = await this.vaultSyncGuard.prepareLocalMutation(
      params.vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );
    const currentSnapshot = syncState.localSnapshot;

    if (
      request.payload.expectedGenesisCertificateDigest !==
      unlockedVault.vaultTrustAnchor.genesisCertificateDigest
    ) {
      throw new DeviceEnrollmentIntegrityError(
        params.vaultId,
        "request trust anchor does not match the vault",
      );
    }

    const currentIdentity =
      unlockedVault.trustedSnapshotContext.trust.trustedDevices.find(
        (device) => device.deviceId === request.payload.deviceId,
      );

    if (currentIdentity !== undefined) {
      const [
        currentSignKeyDigest,
        requestedSignKeyDigest,
        currentVaultKeyDigest,
        requestedVaultKeyDigest,
      ] = await Promise.all([
        this.crypto.digestDevicePublicSignKey(currentIdentity.publicSignKey),
        this.crypto.digestDevicePublicSignKey(request.payload.publicSignKey),
        this.crypto.digestDevicePublicVaultKey(currentIdentity.publicVaultKey),
        this.crypto.digestDevicePublicVaultKey(request.payload.publicVaultKey),
      ]);

      if (
        currentSignKeyDigest !== requestedSignKeyDigest ||
        currentVaultKeyDigest !== requestedVaultKeyDigest
      ) {
        throw new DeviceEnrollmentIntegrityError(
          params.vaultId,
          "requested device public keys do not match its trusted identity",
        );
      }

      const currentSlots = currentSnapshot.keySlots.deviceSlots.filter(
        (slot) => slot.deviceId === request.payload.deviceId,
      );

      if (
        currentSlots.length !== 1 ||
        currentSlots[0]?.vaultKeyGeneration !==
          currentSnapshot.metadata.vaultKeyGeneration
      ) {
        throw new DeviceEnrollmentIntegrityError(
          params.vaultId,
          "requested device does not have one current vault-key envelope",
        );
      }

      return {
        version: 1,
        requestId: request.payload.requestId,
        vaultId: params.vaultId,
        vaultTrustAnchor: unlockedVault.vaultTrustAnchor,
        snapshot: currentSnapshot,
      };
    }

    if (
      currentSnapshot.trustChain.certificates.some((certificate) =>
        certificate.payload.trustedDevices.some(
          (device) => device.deviceId === request.payload.deviceId,
        ),
      )
    ) {
      throw new DeviceEnrollmentIntegrityError(
        params.vaultId,
        "requested device identity was previously revoked",
      );
    }

    await this.vaultSyncGuard.requireProviderCredentialRevocationComplete(
      params.vaultId,
      unlockedVault,
      "authorize device enrollment",
    );

    const targetIdentity = {
      deviceId: request.payload.deviceId,
      publicSignKey: request.payload.publicSignKey,
      publicVaultKey: request.payload.publicVaultKey,
    };
    const nextTrust = await this.vaultTrust.appendTrustTransition(
      params.vaultId,
      currentSnapshot.trustChain,
      unlockedVault.trustedSnapshotContext.trust,
      [
        ...unlockedVault.trustedSnapshotContext.trust.trustedDevices,
        targetIdentity,
      ],
      currentSnapshot.metadata.vaultKeyGeneration,
      unlockedVault.deviceId,
      unlockedVault.devicePrivateSignKey,
    );
    const vaultKeyGeneration = currentSnapshot.metadata.vaultKeyGeneration;
    const targetSlot = {
      deviceId: targetIdentity.deviceId,
      vaultKeyGeneration,
      envelope: await this.crypto.createDeviceVaultKeyEnvelope(
        unlockedVault.vaultMasterKey,
        targetIdentity.publicVaultKey,
        {
          vaultId: params.vaultId,
          deviceId: targetIdentity.deviceId,
          vaultKeyGeneration,
          algorithmSuiteId: this.crypto.algorithmSuite.id,
        },
      ),
    };
    const persistedSnapshot =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.persistUnlockedVault(
            params.vaultId,
            unlockedVault,
            sourceSnapshotVersionVector,
            {
              keySlots: {
                deviceSlots: [
                  ...currentSnapshot.keySlots.deviceSlots,
                  targetSlot,
                ],
              },
              nextTrust: {
                chain: nextTrust.chain,
                state: nextTrust.trust,
              },
            },
          ),
      );

    await this.vaultSyncGuard.uploadPersistedLocalMutation(
      params.vaultId,
      syncState,
      persistedSnapshot.snapshot,
      unlockedVault,
      sessionId,
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      sessionId,
      {
        ...unlockedVault,
        trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
      },
      persistedSnapshot.snapshotVersionVector,
    );

    return {
      version: 1,
      requestId: request.payload.requestId,
      vaultId: params.vaultId,
      vaultTrustAnchor: unlockedVault.vaultTrustAnchor,
      snapshot: persistedSnapshot.snapshot,
    };
  }
}
