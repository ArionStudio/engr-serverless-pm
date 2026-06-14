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
  VaultSnapshotRevisionMismatchError,
} from "../../errors/vault-snapshot.errors";

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
    sourceSnapshotRevision: number,
  ): Promise<{
    readonly revision: number;
    readonly revisionTimestamp: number;
    readonly deviceId: string;
  }> {
    const currentVaultSnapshot =
      await this.requireCurrentSnapshotForUnlockedVault(
        vaultId,
        unlockedVault,
        sourceSnapshotRevision,
      );

    const revisionTimestamp = this.clock.now();

    const unsignedVaultSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        ...currentVaultSnapshot.metadata,
        revision: currentVaultSnapshot.metadata.revision + 1,
        revisionTimestamp,
        createdByDeviceId: unlockedVault.deviceId,
      },
      trustedDevices: currentVaultSnapshot.trustedDevices,
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
      revision: vaultSnapshot.metadata.revision,
      revisionTimestamp: vaultSnapshot.metadata.revisionTimestamp,
      deviceId: vaultSnapshot.metadata.createdByDeviceId,
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
    trustSourceSnapshot: Pick<VaultSnapshot, "trustedDevices">,
  ): Promise<Vault> {
    this.requireSupportedSnapshotAlgorithm(vaultId, vaultSnapshot);

    const signerDevice = trustSourceSnapshot.trustedDevices.find(
      (device) => device.id === vaultSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        vaultId,
        vaultSnapshot.metadata.createdByDeviceId,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      vaultSnapshot,
      signerDevice.publicKeys.signingKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(vaultId);
    }

    return this.crypto.decryptVaultSnapshotContent(
      vaultSnapshot.content,
      vaultMasterKey,
    );
  }

  async requireCurrentSnapshotForUnlockedVault(
    vaultId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotRevision: number,
  ): Promise<VaultSnapshot> {
    if (unlockedVault.vaultId !== vaultId) {
      throw new PersistedVaultMismatchError(vaultId, unlockedVault.vaultId);
    }

    const currentVaultSnapshot = await this.requireLocalVaultSnapshot(vaultId);

    if (currentVaultSnapshot.metadata.revision !== sourceSnapshotRevision) {
      throw new VaultSnapshotRevisionMismatchError({
        vaultId,
        expectedRevision: sourceSnapshotRevision,
        actualRevision: currentVaultSnapshot.metadata.revision,
      });
    }

    this.requireSupportedSnapshotAlgorithm(vaultId, currentVaultSnapshot);

    const trustedDevice = currentVaultSnapshot.trustedDevices.find(
      (device) => device.id === unlockedVault.deviceId,
    );

    if (trustedDevice === undefined) {
      throw new SnapshotSigningDeviceNotTrustedError(
        vaultId,
        unlockedVault.deviceId,
      );
    }

    return currentVaultSnapshot;
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
