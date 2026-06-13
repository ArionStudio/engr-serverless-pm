import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { UnsupportedAlgorithmSuiteError } from "../errors/algorithm-suite.errors";
import {
  VaultSnapshotNotFoundError,
  VaultSnapshotSignerNotTrustedError,
} from "../errors/unlock-vault.errors";
import {
  PersistedVaultMismatchError,
  VaultSnapshotRevisionMismatchError,
} from "../errors/vault-snapshot.errors";

export type PersistUnlockedVaultResult = {
  revision: number;
  revisionTimestamp: number;
  deviceId: string;
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

  async assertCanPersistUnlockedVault(
    vaultId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotRevision: number,
  ): Promise<void> {
    await this.getCurrentVaultSnapshotForUnlockedMutation(
      vaultId,
      unlockedVault,
      sourceSnapshotRevision,
    );
  }

  async persistUnlockedVault(
    vaultId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotRevision: number,
  ): Promise<PersistUnlockedVaultResult> {
    const currentVaultSnapshot =
      await this.getCurrentVaultSnapshotForUnlockedMutation(
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

  async getCurrentVaultSnapshotForUnlockedMutation(
    vaultId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotRevision: number,
  ): Promise<VaultSnapshot> {
    if (unlockedVault.vaultId !== vaultId) {
      throw new PersistedVaultMismatchError(vaultId, unlockedVault.vaultId);
    }

    const currentVaultSnapshot =
      await this.vaultLocalRepository.getVaultSnapshot(vaultId);

    if (currentVaultSnapshot === null) {
      throw new VaultSnapshotNotFoundError(vaultId);
    }

    if (currentVaultSnapshot.metadata.revision !== sourceSnapshotRevision) {
      throw new VaultSnapshotRevisionMismatchError({
        vaultId,
        expectedRevision: sourceSnapshotRevision,
        actualRevision: currentVaultSnapshot.metadata.revision,
      });
    }

    if (
      currentVaultSnapshot.metadata.algorithmSuiteId !==
      this.crypto.algorithmSuite.id
    ) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId,
        artifact: "vault snapshot",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: currentVaultSnapshot.metadata.algorithmSuiteId,
      });
    }

    const signerDevice = currentVaultSnapshot.trustedDevices.find(
      (device) => device.id === unlockedVault.deviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        vaultId,
        unlockedVault.deviceId,
      );
    }

    return currentVaultSnapshot;
  }
}
