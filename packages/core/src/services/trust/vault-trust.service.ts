import type {
  LocalVaultTrustAnchor,
  LocalVaultTrustCheckpoint,
  DeviceEnrollmentTransition,
  DeviceRevocationTransition,
  DeviceTrustTransition,
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
    vaultKeyGeneration: number,
    privateKey: DevicePrivateSignKey,
  ): Promise<{
    readonly anchor: LocalVaultTrustAnchor;
    readonly chain: VaultTrustChain;
    readonly trust: VerifiedVaultTrustState;
  }> {
    if (vaultKeyGeneration !== 1) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "genesis must use vault-key generation 1",
      );
    }

    const payload = {
      version: 1,
      vaultId,
      generation: 0,
      vaultKeyGeneration,
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
        vaultKeyGeneration,
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
    const seenDeviceIds = new Set<string>();
    const seenSigningKeyDigests = new Set<string>();
    const seenVaultKeyDigests = new Set<string>();

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
          certificate.payload.vaultKeyGeneration !== 1 ||
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

        const previousDeviceIds = new Set(
          previous.certificate.payload.trustedDevices.map(
            (device) => device.deviceId,
          ),
        );

        const addedDevices = certificate.payload.trustedDevices.filter(
          (device) => !previousDeviceIds.has(device.deviceId),
        );

        for (const device of addedDevices) {
          const [signingKeyDigest, vaultKeyDigest] = await Promise.all([
            this.crypto.digestDevicePublicSignKey(device.publicSignKey),
            this.crypto.digestDevicePublicVaultKey(device.publicVaultKey),
          ]);

          if (
            seenDeviceIds.has(device.deviceId) ||
            seenSigningKeyDigests.has(signingKeyDigest) ||
            seenVaultKeyDigests.has(vaultKeyDigest)
          ) {
            throw new VaultTrustStateInvalidError(
              vaultId,
              "revoked device identity or public key was enrolled again",
            );
          }
        }

        await this.requireValidTrustTransition(
          vaultId,
          previous.certificate,
          certificate,
        );
      }

      for (const device of certificate.payload.trustedDevices) {
        seenDeviceIds.add(device.deviceId);
        seenSigningKeyDigests.add(
          await this.crypto.digestDevicePublicSignKey(device.publicSignKey),
        );
        seenVaultKeyDigests.add(
          await this.crypto.digestDevicePublicVaultKey(device.publicVaultKey),
        );
      }

      previous = { certificate, digest };
    }

    if (previous === null) {
      throw new VaultTrustStateInvalidError(vaultId, "empty certificate chain");
    }

    return {
      generation: previous.certificate.payload.generation,
      vaultKeyGeneration: previous.certificate.payload.vaultKeyGeneration,
      certificateDigest: previous.digest,
      trustedDevices: previous.certificate.payload.trustedDevices,
    };
  }

  async appendTrustTransition(
    vaultId: string,
    chain: VaultTrustChain,
    currentTrust: VerifiedVaultTrustState,
    trustedDevices: readonly DeviceTrustIdentity[],
    vaultKeyGeneration: number,
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

    if (
      !(await this.crypto.verifyDeviceSignKeyPair(
        authorizer.publicSignKey,
        privateKey,
      ))
    ) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "authorizer private key mismatch",
      );
    }

    const latestCertificate = chain.certificates.at(-1);

    if (
      latestCertificate === undefined ||
      (await this.crypto.digestVaultTrustCertificate(latestCertificate)) !==
        currentTrust.certificateDigest ||
      latestCertificate.payload.vaultKeyGeneration !==
        currentTrust.vaultKeyGeneration
    ) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "current trust chain mismatch",
      );
    }

    const currentDeviceIds = new Set(
      latestCertificate.payload.trustedDevices.map((device) => device.deviceId),
    );
    const seenDeviceIds = new Set(
      chain.certificates.flatMap((certificate) =>
        certificate.payload.trustedDevices.map((device) => device.deviceId),
      ),
    );
    const historicalDevices = chain.certificates.flatMap(
      (certificate) => certificate.payload.trustedDevices,
    );
    const [seenSigningKeyDigests, seenVaultKeyDigests] = await Promise.all([
      Promise.all(
        historicalDevices.map((device) =>
          this.crypto.digestDevicePublicSignKey(device.publicSignKey),
        ),
      ),
      Promise.all(
        historicalDevices.map((device) =>
          this.crypto.digestDevicePublicVaultKey(device.publicVaultKey),
        ),
      ),
    ]);
    const historicalSigningKeys = new Set(seenSigningKeyDigests);
    const historicalVaultKeys = new Set(seenVaultKeyDigests);
    const addedDevices = trustedDevices.filter(
      (device) => !currentDeviceIds.has(device.deviceId),
    );

    for (const device of addedDevices) {
      const [signingKeyDigest, vaultKeyDigest] = await Promise.all([
        this.crypto.digestDevicePublicSignKey(device.publicSignKey),
        this.crypto.digestDevicePublicVaultKey(device.publicVaultKey),
      ]);

      if (
        seenDeviceIds.has(device.deviceId) ||
        historicalSigningKeys.has(signingKeyDigest) ||
        historicalVaultKeys.has(vaultKeyDigest)
      ) {
        throw new VaultTrustStateInvalidError(
          vaultId,
          "revoked device identity or public key cannot be enrolled again",
        );
      }
    }

    const payload = {
      version: 1,
      vaultId,
      generation: currentTrust.generation + 1,
      vaultKeyGeneration,
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
    await this.requireValidTrustTransition(
      vaultId,
      latestCertificate,
      certificate,
    );
    const certificateDigest =
      await this.crypto.digestVaultTrustCertificate(certificate);

    return {
      chain: {
        certificates: [...chain.certificates, certificate],
      },
      trust: {
        generation: payload.generation,
        vaultKeyGeneration,
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
    if (snapshot.metadata.id !== vaultId) {
      throw new VaultTrustStateInvalidError(vaultId, "snapshot vault mismatch");
    }

    if (
      snapshot.metadata.schemaVersion !== 1 ||
      snapshot.metadata.algorithmSuiteId !== this.crypto.algorithmSuite.id ||
      snapshot.metadata.vaultKeyGeneration !== trust.vaultKeyGeneration
    ) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "unsupported snapshot format",
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

    this.requireValidDeviceSlots(vaultId, snapshot, trust);

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
      vaultKeyGeneration: snapshot.metadata.vaultKeyGeneration,
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
      !Number.isSafeInteger(checkpoint.payload.vaultKeyGeneration) ||
      checkpoint.payload.vaultKeyGeneration < 1 ||
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
      snapshot.metadata.vaultKeyGeneration <
        checkpoint.payload.vaultKeyGeneration ||
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

  async verifyDeviceRevocationSuffix(
    vaultId: string,
    chain: VaultTrustChain,
    localTrust: VerifiedVaultTrustState,
    remoteTrust: VerifiedVaultTrustState,
  ): Promise<readonly DeviceRevocationTransition[]> {
    const transitions = await this.verifyDeviceTrustSuffix(
      vaultId,
      chain,
      localTrust,
      remoteTrust,
    );
    const revocations = transitions.filter(
      (transition): transition is DeviceRevocationTransition =>
        transition.type === "revocation",
    );

    if (revocations.length !== transitions.length) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "trust suffix is not a sequence of device revocations",
      );
    }

    return revocations;
  }

  async verifyDeviceEnrollmentSuffix(
    vaultId: string,
    chain: VaultTrustChain,
    localTrust: VerifiedVaultTrustState,
    remoteTrust: VerifiedVaultTrustState,
  ): Promise<readonly DeviceEnrollmentTransition[]> {
    const transitions = await this.verifyDeviceTrustSuffix(
      vaultId,
      chain,
      localTrust,
      remoteTrust,
    );
    const enrollments = transitions.filter(
      (transition): transition is DeviceEnrollmentTransition =>
        transition.type === "enrollment",
    );

    if (enrollments.length !== transitions.length) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "trust suffix is not a sequence of device enrollments",
      );
    }

    return enrollments;
  }

  async verifyDeviceTrustSuffix(
    vaultId: string,
    chain: VaultTrustChain,
    localTrust: VerifiedVaultTrustState,
    remoteTrust: VerifiedVaultTrustState,
  ): Promise<readonly DeviceTrustTransition[]> {
    await this.requireTrustDescendsFrom(
      vaultId,
      chain,
      remoteTrust,
      localTrust,
    );

    if (remoteTrust.generation <= localTrust.generation) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "device trust transition is missing",
      );
    }

    const transitions: DeviceTrustTransition[] = [];

    for (
      let generation = localTrust.generation + 1;
      generation <= remoteTrust.generation;
      generation += 1
    ) {
      const previousCertificate = chain.certificates[generation - 1];
      const certificate = chain.certificates[generation];

      if (previousCertificate === undefined || certificate === undefined) {
        throw new VaultTrustStateInvalidError(
          vaultId,
          "device trust chain is incomplete",
        );
      }

      const addedDevices = certificate.payload.trustedDevices.filter(
        (device) =>
          !previousCertificate.payload.trustedDevices.some(
            (previousDevice) => previousDevice.deviceId === device.deviceId,
          ),
      );
      const removedDevices = previousCertificate.payload.trustedDevices.filter(
        (previousDevice) =>
          !certificate.payload.trustedDevices.some(
            (device) => device.deviceId === previousDevice.deviceId,
          ),
      );
      const authorizerSurvives = certificate.payload.trustedDevices.some(
        (device) =>
          device.deviceId === certificate.payload.authorizedByDeviceId,
      );

      if (
        addedDevices.length === 1 &&
        removedDevices.length === 0 &&
        certificate.payload.vaultKeyGeneration ===
          previousCertificate.payload.vaultKeyGeneration
      ) {
        transitions.push({
          type: "enrollment",
          enrolledDeviceId: addedDevices[0].deviceId,
          authorizedByDeviceId: certificate.payload.authorizedByDeviceId,
          trustGeneration: certificate.payload.generation,
          vaultKeyGeneration: certificate.payload.vaultKeyGeneration,
        });
        continue;
      }

      if (
        addedDevices.length === 0 &&
        removedDevices.length === 1 &&
        authorizerSurvives &&
        certificate.payload.vaultKeyGeneration ===
          previousCertificate.payload.vaultKeyGeneration + 1
      ) {
        transitions.push({
          type: "revocation",
          revokedDeviceId: removedDevices[0].deviceId,
          authorizedByDeviceId: certificate.payload.authorizedByDeviceId,
          trustGeneration: certificate.payload.generation,
          vaultKeyGeneration: certificate.payload.vaultKeyGeneration,
        });
        continue;
      }

      throw new VaultTrustStateInvalidError(
        vaultId,
        "unsupported device trust transition",
      );
    }

    return transitions;
  }

  private requireValidDeviceIdentities(
    vaultId: string,
    certificate: VaultTrustCertificate,
  ): void {
    if (
      certificate.payload.version !== 1 ||
      certificate.payload.generation < 0 ||
      !Number.isSafeInteger(certificate.payload.generation) ||
      !Number.isSafeInteger(certificate.payload.vaultKeyGeneration) ||
      certificate.payload.vaultKeyGeneration < 1 ||
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

  private async areDeviceIdentitiesEqual(
    left: DeviceTrustIdentity,
    right: DeviceTrustIdentity,
  ): Promise<boolean> {
    return (
      (await this.arePublicKeysEqual(
        left.publicSignKey,
        right.publicSignKey,
      )) &&
      (await this.crypto.digestDevicePublicVaultKey(left.publicVaultKey)) ===
        (await this.crypto.digestDevicePublicVaultKey(right.publicVaultKey))
    );
  }

  private async requireValidTrustTransition(
    vaultId: string,
    previous: VaultTrustCertificate,
    current: VaultTrustCertificate,
  ): Promise<void> {
    const addedDevices = current.payload.trustedDevices.filter(
      (device) =>
        !previous.payload.trustedDevices.some(
          (previousDevice) => previousDevice.deviceId === device.deviceId,
        ),
    );
    const removedDevices = previous.payload.trustedDevices.filter(
      (device) =>
        !current.payload.trustedDevices.some(
          (currentDevice) => currentDevice.deviceId === device.deviceId,
        ),
    );

    for (const currentDevice of current.payload.trustedDevices) {
      const previousDevice = previous.payload.trustedDevices.find(
        (device) => device.deviceId === currentDevice.deviceId,
      );

      if (
        previousDevice !== undefined &&
        !(await this.areDeviceIdentitiesEqual(previousDevice, currentDevice))
      ) {
        throw new VaultTrustStateInvalidError(
          vaultId,
          "trusted device identity changed",
        );
      }
    }

    const isEnrollment =
      addedDevices.length === 1 &&
      removedDevices.length === 0 &&
      current.payload.vaultKeyGeneration ===
        previous.payload.vaultKeyGeneration;
    const isRevocation =
      addedDevices.length === 0 &&
      removedDevices.length > 0 &&
      current.payload.vaultKeyGeneration ===
        previous.payload.vaultKeyGeneration + 1 &&
      current.payload.trustedDevices.some(
        (device) => device.deviceId === current.payload.authorizedByDeviceId,
      );

    if (!isEnrollment && !isRevocation) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "unsupported trust transition",
      );
    }
  }

  private async requireUniquePublicKeys(
    vaultId: string,
    certificate: VaultTrustCertificate,
  ): Promise<void> {
    const signingKeyDigests = await Promise.all(
      certificate.payload.trustedDevices.map((device) =>
        this.crypto.digestDevicePublicSignKey(device.publicSignKey),
      ),
    );
    const vaultKeyDigests = await Promise.all(
      certificate.payload.trustedDevices.map((device) =>
        this.crypto.digestDevicePublicVaultKey(device.publicVaultKey),
      ),
    );

    if (
      new Set(signingKeyDigests).size !== signingKeyDigests.length ||
      new Set(vaultKeyDigests).size !== vaultKeyDigests.length
    ) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "duplicate trusted device public key",
      );
    }
  }

  private requireValidDeviceSlots(
    vaultId: string,
    snapshot: VaultSnapshot,
    trust: VerifiedVaultTrustState,
  ): void {
    const trustedDeviceIds = new Set(
      trust.trustedDevices.map((device) => device.deviceId),
    );
    const slotDeviceIds = new Set(
      snapshot.keySlots.deviceSlots.map((slot) => slot.deviceId),
    );

    if (
      !Number.isSafeInteger(snapshot.metadata.vaultKeyGeneration) ||
      snapshot.metadata.vaultKeyGeneration < 1 ||
      trustedDeviceIds.size !== trust.trustedDevices.length ||
      slotDeviceIds.size !== snapshot.keySlots.deviceSlots.length ||
      trustedDeviceIds.size !== slotDeviceIds.size
    ) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "device key slots do not match trusted devices",
      );
    }

    for (const slot of snapshot.keySlots.deviceSlots) {
      if (
        !trustedDeviceIds.has(slot.deviceId) ||
        slot.vaultKeyGeneration !== snapshot.metadata.vaultKeyGeneration ||
        slot.envelope.recipientDeviceId !== slot.deviceId ||
        slot.envelope.vaultKeyGeneration !== slot.vaultKeyGeneration
      ) {
        throw new VaultTrustStateInvalidError(
          vaultId,
          "device key slot context is invalid",
        );
      }
    }
  }
}
