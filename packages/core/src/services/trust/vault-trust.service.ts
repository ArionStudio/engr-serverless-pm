import type {
  LocalVaultTrustAnchor,
  LocalVaultTrustCheckpoint,
  DeviceTrustIdentity,
  VaultTrustCertificate,
  VaultTrustChain,
  VerifiedVaultTrustState,
} from "../../domain/device-trust";
import type { DevicePrivateSignKey } from "../../domain/device-trust/brand-keys";
import type { VaultSnapshot } from "../../domain/snapshot";
import { compareVersionVectors } from "../../domain/versioning/version-vector.utils";
import {
  LocalVaultTrustCheckpointInvalidError,
  VaultSnapshotRollbackDetectedError,
  VaultTrustStateInvalidError,
} from "../../errors/vault-trust.errors";
import {
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../errors/unlock-vault.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";

export class VaultTrustService {
  private readonly crypto: CryptoPort;

  constructor(crypto: CryptoPort) {
    this.crypto = crypto;
  }

  async createGenesis(
    vaultId: string,
    device: DeviceTrustIdentity,
    privateKey: DevicePrivateSignKey,
  ): Promise<{
    readonly anchor: LocalVaultTrustAnchor;
    readonly chain: VaultTrustChain;
    readonly trust: VerifiedVaultTrustState;
  }> {
    const payload = {
      version: 1,
      vaultId,
      generation: 0,
      previousCertificateDigest: null,
      authorizedByDeviceId: device.deviceId,
      trustedDevices: [device],
    } as const;
    const certificate: VaultTrustCertificate = {
      payload,
      signature: await this.crypto.signVaultTrustCertificate(
        payload,
        privateKey,
      ),
    };
    const certificateDigest =
      await this.crypto.digestVaultTrustCertificate(certificate);

    return {
      anchor: {
        version: 1,
        vaultId,
        genesisDeviceId: device.deviceId,
        genesisPublicSignKey: device.publicSignKey,
        genesisCertificateDigest: certificateDigest,
      },
      chain: {
        certificates: [certificate],
      },
      trust: {
        generation: 0,
        certificateDigest,
        trustedDevices: [device],
      },
    };
  }

  async verifyTrustChain(
    vaultId: string,
    anchor: LocalVaultTrustAnchor,
    chain: VaultTrustChain,
  ): Promise<VerifiedVaultTrustState> {
    if (anchor.vaultId !== vaultId || anchor.version !== 1) {
      throw new VaultTrustStateInvalidError(vaultId, "anchor mismatch");
    }

    if (chain.certificates.length === 0) {
      throw new VaultTrustStateInvalidError(vaultId, "genesis mismatch");
    }

    let previous: {
      readonly certificate: VaultTrustCertificate;
      readonly digest: string;
    } | null = null;

    for (const certificate of chain.certificates) {
      this.requireValidDeviceIdentities(vaultId, certificate);
      await this.requireUniquePublicKeys(vaultId, certificate);

      if (certificate.payload.vaultId !== vaultId) {
        throw new VaultTrustStateInvalidError(
          vaultId,
          "certificate vault mismatch",
        );
      }

      const digest = await this.crypto.digestVaultTrustCertificate(certificate);

      if (previous === null) {
        if (
          certificate.payload.generation !== 0 ||
          certificate.payload.previousCertificateDigest !== null ||
          certificate.payload.authorizedByDeviceId !== anchor.genesisDeviceId ||
          digest !== anchor.genesisCertificateDigest
        ) {
          throw new VaultTrustStateInvalidError(
            vaultId,
            "invalid genesis certificate",
          );
        }

        const genesisIdentity = certificate.payload.trustedDevices.find(
          (device) => device.deviceId === anchor.genesisDeviceId,
        );

        if (
          genesisIdentity === undefined ||
          !(await this.arePublicKeysEqual(
            genesisIdentity.publicSignKey,
            anchor.genesisPublicSignKey,
          )) ||
          !(await this.crypto.verifyVaultTrustCertificateSignature(
            certificate,
            anchor.genesisPublicSignKey,
          ))
        ) {
          throw new VaultTrustStateInvalidError(
            vaultId,
            "invalid genesis signature",
          );
        }
      } else {
        if (
          certificate.payload.generation !==
            previous.certificate.payload.generation + 1 ||
          certificate.payload.previousCertificateDigest !== previous.digest
        ) {
          throw new VaultTrustStateInvalidError(
            vaultId,
            "disconnected certificate chain",
          );
        }

        const authorizer = previous.certificate.payload.trustedDevices.find(
          (device) =>
            device.deviceId === certificate.payload.authorizedByDeviceId,
        );

        if (
          authorizer === undefined ||
          !(await this.crypto.verifyVaultTrustCertificateSignature(
            certificate,
            authorizer.publicSignKey,
          ))
        ) {
          throw new VaultTrustStateInvalidError(
            vaultId,
            "unauthorized trust transition",
          );
        }
      }

      previous = { certificate, digest };
    }

    if (previous === null) {
      throw new VaultTrustStateInvalidError(vaultId, "empty certificate chain");
    }

    return {
      generation: previous.certificate.payload.generation,
      certificateDigest: previous.digest,
      trustedDevices: previous.certificate.payload.trustedDevices,
    };
  }

  async appendTrustTransition(
    vaultId: string,
    chain: VaultTrustChain,
    currentTrust: VerifiedVaultTrustState,
    trustedDevices: readonly DeviceTrustIdentity[],
    authorizedByDeviceId: string,
    privateKey: DevicePrivateSignKey,
  ): Promise<{
    readonly chain: VaultTrustChain;
    readonly trust: VerifiedVaultTrustState;
  }> {
    const authorizer = currentTrust.trustedDevices.find(
      (device) => device.deviceId === authorizedByDeviceId,
    );

    if (authorizer === undefined) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "authorizer is not trusted",
      );
    }

    const latestCertificate = chain.certificates.at(-1);

    if (
      latestCertificate === undefined ||
      (await this.crypto.digestVaultTrustCertificate(latestCertificate)) !==
        currentTrust.certificateDigest
    ) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "current trust chain mismatch",
      );
    }

    const payload = {
      version: 1,
      vaultId,
      generation: currentTrust.generation + 1,
      previousCertificateDigest: currentTrust.certificateDigest,
      authorizedByDeviceId,
      trustedDevices,
    } as const;
    const certificate: VaultTrustCertificate = {
      payload,
      signature: await this.crypto.signVaultTrustCertificate(
        payload,
        privateKey,
      ),
    };
    this.requireValidDeviceIdentities(vaultId, certificate);
    await this.requireUniquePublicKeys(vaultId, certificate);
    const certificateDigest =
      await this.crypto.digestVaultTrustCertificate(certificate);

    return {
      chain: {
        certificates: [...chain.certificates, certificate],
      },
      trust: {
        generation: payload.generation,
        certificateDigest,
        trustedDevices,
      },
    };
  }

  async verifySnapshot(
    vaultId: string,
    snapshot: VaultSnapshot,
    trust: VerifiedVaultTrustState,
  ): Promise<void> {
    if (snapshot.metadata.schemaVersion !== 2) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "unsupported snapshot schema version",
      );
    }

    const signer = trust.trustedDevices.find(
      (device) => device.deviceId === snapshot.metadata.createdByDeviceId,
    );

    if (signer === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        vaultId,
        snapshot.metadata.createdByDeviceId,
      );
    }

    const matchingSlots = snapshot.keySlots.deviceSlots.filter(
      (slot) => slot.deviceId === signer.deviceId,
    );

    if (
      matchingSlots.length !== 1 ||
      !(await this.arePublicKeysEqual(
        matchingSlots[0].publicSignKey,
        signer.publicSignKey,
      ))
    ) {
      throw new VaultSnapshotSignerNotTrustedError(vaultId, signer.deviceId);
    }

    if (
      !(await this.crypto.verifyVaultSnapshotSignature(
        snapshot,
        signer.publicSignKey,
      ))
    ) {
      throw new VaultSnapshotSignatureVerificationFailedError(vaultId);
    }
  }

  async createCheckpoint(
    snapshot: VaultSnapshot,
    trust: VerifiedVaultTrustState,
    deviceId: string,
    privateKey: DevicePrivateSignKey,
  ): Promise<LocalVaultTrustCheckpoint> {
    const payload = {
      version: 1,
      vaultId: snapshot.metadata.id,
      deviceId,
      trustGeneration: trust.generation,
      trustCertificateDigest: trust.certificateDigest,
      snapshotVersionVector: snapshot.metadata.snapshotVersionVector,
      snapshotDigest: await this.crypto.digestVaultSnapshot(snapshot),
    } as const;

    return {
      payload,
      signature: await this.crypto.signLocalVaultTrustCheckpoint(
        payload,
        privateKey,
      ),
    };
  }

  async verifyCheckpoint(
    vaultId: string,
    checkpoint: LocalVaultTrustCheckpoint,
    device: DeviceTrustIdentity,
  ): Promise<void> {
    if (
      checkpoint.payload.vaultId !== vaultId ||
      checkpoint.payload.deviceId !== device.deviceId ||
      checkpoint.payload.version !== 1 ||
      !(await this.crypto.verifyLocalVaultTrustCheckpointSignature(
        checkpoint,
        device.publicSignKey,
      ))
    ) {
      throw new LocalVaultTrustCheckpointInvalidError(
        vaultId,
        "identity or signature mismatch",
      );
    }
  }

  async requireSnapshotNotRolledBack(
    vaultId: string,
    snapshot: VaultSnapshot,
    trust: VerifiedVaultTrustState,
    checkpoint: LocalVaultTrustCheckpoint,
  ): Promise<"same" | "newer"> {
    const relation = compareVersionVectors(
      snapshot.metadata.snapshotVersionVector,
      checkpoint.payload.snapshotVersionVector,
    );
    const snapshotDigest = await this.crypto.digestVaultSnapshot(snapshot);

    await this.requireTrustDescendsFrom(vaultId, snapshot.trustChain, trust, {
      generation: checkpoint.payload.trustGeneration,
      certificateDigest: checkpoint.payload.trustCertificateDigest,
    });

    if (
      relation === "remote_ahead" ||
      relation === "broken" ||
      (relation === "equal" &&
        snapshotDigest !== checkpoint.payload.snapshotDigest)
    ) {
      throw new VaultSnapshotRollbackDetectedError(vaultId);
    }

    return relation === "equal" ? "same" : "newer";
  }

  async requireTrustDescendsFrom(
    vaultId: string,
    chain: VaultTrustChain,
    trust: VerifiedVaultTrustState,
    baseline: Pick<VerifiedVaultTrustState, "generation" | "certificateDigest">,
  ): Promise<void> {
    if (trust.generation < baseline.generation) {
      throw new VaultSnapshotRollbackDetectedError(vaultId);
    }

    const baselineCertificate = chain.certificates[baseline.generation];

    if (
      baselineCertificate === undefined ||
      (await this.crypto.digestVaultTrustCertificate(baselineCertificate)) !==
        baseline.certificateDigest
    ) {
      throw new VaultSnapshotRollbackDetectedError(vaultId);
    }
  }

  private requireValidDeviceIdentities(
    vaultId: string,
    certificate: VaultTrustCertificate,
  ): void {
    if (
      certificate.payload.version !== 1 ||
      certificate.payload.generation < 0 ||
      !Number.isSafeInteger(certificate.payload.generation) ||
      certificate.payload.trustedDevices.length === 0 ||
      new Set(
        certificate.payload.trustedDevices.map((device) => device.deviceId),
      ).size !== certificate.payload.trustedDevices.length
    ) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "invalid certificate fields",
      );
    }
  }

  private async arePublicKeysEqual(
    left: DeviceTrustIdentity["publicSignKey"],
    right: DeviceTrustIdentity["publicSignKey"],
  ): Promise<boolean> {
    return (
      (await this.crypto.digestDevicePublicSignKey(left)) ===
      (await this.crypto.digestDevicePublicSignKey(right))
    );
  }

  private async requireUniquePublicKeys(
    vaultId: string,
    certificate: VaultTrustCertificate,
  ): Promise<void> {
    const digests = await Promise.all(
      certificate.payload.trustedDevices.map((device) =>
        this.crypto.digestDevicePublicSignKey(device.publicSignKey),
      ),
    );

    if (new Set(digests).size !== digests.length) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "duplicate trusted device public key",
      );
    }
  }
}
