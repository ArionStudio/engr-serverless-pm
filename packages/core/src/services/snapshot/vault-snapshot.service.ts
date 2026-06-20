import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { DeviceKeySlot } from "../../domain/snapshot/key-slot";
import type {
  CompletedDeviceEnrollmentProof,
  DeviceEnrollmentAuthorizationPayload,
} from "../../domain/device-trust";
import type { VaultMasterKey } from "../../domain/snapshot/brand-keys";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { Vault } from "../../domain/vault/vault";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../errors/unlock-vault.errors";
import {
  PersistedVaultMismatchError,
  SnapshotSigningDeviceNotTrustedError,
  VaultSnapshotVersionMismatchError,
} from "../../errors/vault-snapshot.errors";
import {
  compareVersionVectors,
  incrementVersionVector,
} from "../../domain/versioning/version-vector.utils";
import type { VersionVector } from "../../domain/versioning/version-vector.type";

export type OpenTrustedVaultSnapshotResult = {
  readonly vault: Vault;
  readonly completedEnrollmentProof: CompletedDeviceEnrollmentProof | null;
};

export class VaultSnapshotService {
  private readonly crypto: CryptoPort;
  private readonly clock: ClockPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    crypto: CryptoPort,
    clock: ClockPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.crypto = crypto;
    this.clock = clock;
    this.vaultLocalRepository = vaultLocalRepository;
  }

  async persistUnlockedVault(
    vaultId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
    options: {
      readonly baseSnapshotVersionVector?: VersionVector;
      readonly keySlots?: UnsignedVaultSnapshot["keySlots"];
    } = {},
  ): Promise<{
    readonly snapshotVersionVector: VersionVector;
    readonly revisionTimestamp: number;
  }> {
    const currentVaultSnapshot =
      await this.requireCurrentSnapshotForUnlockedVault(
        vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );

    const revisionTimestamp = this.clock.now();
    const keySlots = options.keySlots ?? currentVaultSnapshot.keySlots;

    if (
      !keySlots.deviceSlots.some(
        (deviceSlot) => deviceSlot.deviceId === unlockedVault.deviceId,
      )
    ) {
      throw new SnapshotSigningDeviceNotTrustedError(
        vaultId,
        unlockedVault.deviceId,
      );
    }

    const unsignedVaultSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        ...currentVaultSnapshot.metadata,
        revisionTimestamp,
        snapshotVersionVector: incrementVersionVector(
          options.baseSnapshotVersionVector ??
            currentVaultSnapshot.metadata.snapshotVersionVector,
          unlockedVault.deviceId,
        ),
        createdByDeviceId: unlockedVault.deviceId,
      },
      keySlots,
      content: await this.crypto.encryptVaultSnapshotContent(
        unlockedVault.vault,
        unlockedVault.vaultMasterKey,
      ),
    };

    const vaultSnapshot: VaultSnapshot = {
      ...unsignedVaultSnapshot,
      signature: await this.crypto.signVaultSnapshot(
        unsignedVaultSnapshot,
        unlockedVault.devicePrivateSignKey,
      ),
    };

    await this.vaultLocalRepository.saveVaultSnapshot(vaultSnapshot);

    return {
      snapshotVersionVector: vaultSnapshot.metadata.snapshotVersionVector,
      revisionTimestamp: vaultSnapshot.metadata.revisionTimestamp,
    };
  }

  async requireLocalVaultSnapshot(vaultId: string): Promise<VaultSnapshot> {
    const vaultSnapshot =
      await this.vaultLocalRepository.getVaultSnapshot(vaultId);

    if (vaultSnapshot === null) {
      throw new VaultSnapshotNotFoundError(vaultId);
    }

    return vaultSnapshot;
  }

  async restoreLocalVaultSnapshot(vaultSnapshot: VaultSnapshot): Promise<void> {
    await this.vaultLocalRepository.saveVaultSnapshot(vaultSnapshot);
  }

  async openTrustedVaultSnapshot(
    vaultId: string,
    vaultSnapshot: VaultSnapshot,
    vaultMasterKey: VaultMasterKey,
    trustSourceSnapshot: Pick<VaultSnapshot, "keySlots">,
  ): Promise<Vault> {
    const { vault } = await this.openTrustedVaultSnapshotWithTrustResult(
      vaultId,
      vaultSnapshot,
      vaultMasterKey,
      trustSourceSnapshot,
    );

    return vault;
  }

  async openTrustedVaultSnapshotWithTrustResult(
    vaultId: string,
    vaultSnapshot: VaultSnapshot,
    vaultMasterKey: VaultMasterKey,
    trustSourceSnapshot: Pick<VaultSnapshot, "keySlots">,
  ): Promise<OpenTrustedVaultSnapshotResult> {
    this.requireSupportedSnapshotAlgorithm(vaultId, vaultSnapshot);

    if (vaultSnapshot.metadata.id !== vaultId) {
      throw new PersistedVaultMismatchError(vaultId, vaultSnapshot.metadata.id);
    }

    const completedEnrollmentProof = await this.requireTrustedSnapshotSignature(
      vaultId,
      vaultSnapshot,
      trustSourceSnapshot,
    );
    const vault = await this.crypto.decryptVaultSnapshotContent(
      vaultSnapshot.content,
      vaultMasterKey,
    );

    if (completedEnrollmentProof !== null) {
      this.requireCompletedEnrollmentVaultState(
        vaultId,
        vault,
        completedEnrollmentProof,
      );
    }

    return {
      vault,
      completedEnrollmentProof,
    };
  }

  async requireCurrentSnapshotForUnlockedVault(
    vaultId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
  ): Promise<VaultSnapshot> {
    if (unlockedVault.vaultId !== vaultId) {
      throw new PersistedVaultMismatchError(vaultId, unlockedVault.vaultId);
    }

    const currentVaultSnapshot = await this.requireLocalVaultSnapshot(vaultId);

    if (
      compareVersionVectors(
        currentVaultSnapshot.metadata.snapshotVersionVector,
        sourceSnapshotVersionVector,
      ) !== "equal"
    ) {
      throw new VaultSnapshotVersionMismatchError(
        vaultId,
        sourceSnapshotVersionVector,
        currentVaultSnapshot.metadata.snapshotVersionVector,
      );
    }

    this.requireSupportedSnapshotAlgorithm(vaultId, currentVaultSnapshot);
    await this.requireTrustedSnapshotSignature(
      vaultId,
      currentVaultSnapshot,
      currentVaultSnapshot,
    );

    const trustedDevice = currentVaultSnapshot.keySlots.deviceSlots.find(
      (deviceSlot) => deviceSlot.deviceId === unlockedVault.deviceId,
    );

    if (trustedDevice === undefined) {
      throw new SnapshotSigningDeviceNotTrustedError(
        vaultId,
        unlockedVault.deviceId,
      );
    }

    return currentVaultSnapshot;
  }

  private async requireTrustedSnapshotSignature(
    vaultId: string,
    vaultSnapshot: VaultSnapshot,
    trustSourceSnapshot: Pick<VaultSnapshot, "keySlots">,
  ): Promise<CompletedDeviceEnrollmentProof | null> {
    const signerDevice = trustSourceSnapshot.keySlots.deviceSlots.find(
      (deviceSlot) =>
        deviceSlot.deviceId === vaultSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      return this.requireCompletedEnrollmentSnapshotSignature(
        vaultId,
        vaultSnapshot,
        trustSourceSnapshot,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      vaultSnapshot,
      signerDevice.publicSignKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(vaultId);
    }

    return null;
  }

  private async requireCompletedEnrollmentSnapshotSignature(
    vaultId: string,
    vaultSnapshot: VaultSnapshot,
    trustSourceSnapshot: Pick<VaultSnapshot, "keySlots">,
  ): Promise<CompletedDeviceEnrollmentProof> {
    const pendingDeviceId = vaultSnapshot.metadata.createdByDeviceId;
    const completedEnrollmentProofs =
      vaultSnapshot.keySlots.completedEnrollments?.filter(
        (proof) => proof.pendingDeviceId === pendingDeviceId,
      ) ?? [];

    if (completedEnrollmentProofs.length !== 1) {
      throw new VaultSnapshotSignerNotTrustedError(vaultId, pendingDeviceId);
    }

    const completedEnrollmentProof = completedEnrollmentProofs[0];

    if (completedEnrollmentProof.vaultId !== vaultId) {
      throw new VaultSnapshotSignerNotTrustedError(vaultId, pendingDeviceId);
    }

    if (
      isCompletedEnrollmentProofKnown(
        trustSourceSnapshot.keySlots.completedEnrollments,
        completedEnrollmentProof,
      )
    ) {
      throw new VaultSnapshotSignerNotTrustedError(vaultId, pendingDeviceId);
    }

    const authorizerDevice = trustSourceSnapshot.keySlots.deviceSlots.find(
      (deviceSlot) =>
        deviceSlot.deviceId === completedEnrollmentProof.authorizedByDeviceId,
    );

    if (authorizerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(vaultId, pendingDeviceId);
    }

    const authorization = toAuthorizationPayload(completedEnrollmentProof);
    const isEnrollmentAuthorized =
      await this.crypto.verifyDeviceEnrollmentAuthorizationSignature(
        authorization,
        completedEnrollmentProof.authorizerSignature,
        authorizerDevice.publicSignKey,
      );

    if (!isEnrollmentAuthorized) {
      throw new VaultSnapshotSignerNotTrustedError(vaultId, pendingDeviceId);
    }

    const signerDevice = this.findUniqueDeviceSlot(
      vaultId,
      vaultSnapshot.keySlots.deviceSlots,
      pendingDeviceId,
    );
    const signerDevicePublicSignKeyDigest =
      await this.crypto.digestDevicePublicSignKey(signerDevice.publicSignKey);

    if (
      signerDevicePublicSignKeyDigest !==
      completedEnrollmentProof.pendingDevicePublicSignKeyDigest
    ) {
      throw new VaultSnapshotSignerNotTrustedError(vaultId, pendingDeviceId);
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      vaultSnapshot,
      signerDevice.publicSignKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(vaultId);
    }

    return completedEnrollmentProof;
  }

  private findUniqueDeviceSlot(
    vaultId: string,
    deviceSlots: readonly DeviceKeySlot[],
    deviceId: string,
  ): DeviceKeySlot {
    const matchingDeviceSlots = deviceSlots.filter(
      (deviceSlot) => deviceSlot.deviceId === deviceId,
    );

    if (matchingDeviceSlots.length !== 1) {
      throw new VaultSnapshotSignerNotTrustedError(vaultId, deviceId);
    }

    return matchingDeviceSlots[0];
  }

  private requireCompletedEnrollmentVaultState(
    vaultId: string,
    vault: Vault,
    completedEnrollmentProof: CompletedDeviceEnrollmentProof,
  ): void {
    if (
      !vault.deviceProfiles.some(
        (deviceProfile) =>
          deviceProfile.id === completedEnrollmentProof.pendingDeviceId,
      )
    ) {
      throw new VaultSnapshotSignerNotTrustedError(
        vaultId,
        completedEnrollmentProof.pendingDeviceId,
      );
    }
  }

  private requireSupportedSnapshotAlgorithm(
    vaultId: string,
    vaultSnapshot: VaultSnapshot,
  ): void {
    if (
      vaultSnapshot.metadata.algorithmSuiteId !== this.crypto.algorithmSuite.id
    ) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId,
        artifact: "vault snapshot",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: vaultSnapshot.metadata.algorithmSuiteId,
      });
    }
  }
}

function toAuthorizationPayload(
  completedEnrollmentProof: CompletedDeviceEnrollmentProof,
): DeviceEnrollmentAuthorizationPayload {
  return {
    version: completedEnrollmentProof.version,
    vaultId: completedEnrollmentProof.vaultId,
    enrollmentId: completedEnrollmentProof.enrollmentId,
    pendingDeviceId: completedEnrollmentProof.pendingDeviceId,
    pendingDevicePublicSignKeyDigest:
      completedEnrollmentProof.pendingDevicePublicSignKeyDigest,
    protectedVaultMasterKeyDigest:
      completedEnrollmentProof.protectedVaultMasterKeyDigest,
  };
}

function isCompletedEnrollmentProofKnown(
  completedEnrollments: readonly CompletedDeviceEnrollmentProof[] | undefined,
  completedEnrollmentProof: CompletedDeviceEnrollmentProof,
): boolean {
  return (completedEnrollments ?? []).some(
    (knownProof) =>
      knownProof.vaultId === completedEnrollmentProof.vaultId &&
      knownProof.enrollmentId === completedEnrollmentProof.enrollmentId &&
      knownProof.pendingDeviceId === completedEnrollmentProof.pendingDeviceId,
  );
}
