import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
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

    const unsignedVaultSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        ...currentVaultSnapshot.metadata,
        revisionTimestamp,
        snapshotVersionVector: incrementVersionVector(
          currentVaultSnapshot.metadata.snapshotVersionVector,
          unlockedVault.deviceId,
        ),
        createdByDeviceId: unlockedVault.deviceId,
      },
      keySlots: currentVaultSnapshot.keySlots,
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

  async openTrustedVaultSnapshot(
    vaultId: string,
    vaultSnapshot: VaultSnapshot,
    vaultMasterKey: VaultMasterKey,
    trustSourceSnapshot: Pick<VaultSnapshot, "keySlots">,
  ): Promise<Vault> {
    this.requireSupportedSnapshotAlgorithm(vaultId, vaultSnapshot);
    await this.requireTrustedSnapshotSignature(
      vaultId,
      vaultSnapshot,
      trustSourceSnapshot,
    );

    return this.crypto.decryptVaultSnapshotContent(
      vaultSnapshot.content,
      vaultMasterKey,
    );
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
  ): Promise<void> {
    const signerDevice = trustSourceSnapshot.keySlots.deviceSlots.find(
      (deviceSlot) =>
        deviceSlot.deviceId === vaultSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        vaultId,
        vaultSnapshot.metadata.createdByDeviceId,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      vaultSnapshot,
      signerDevice.publicSignKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(vaultId);
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
