import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { UnsupportedAlgorithmSuiteError } from "../__errors/algorithm-suite.errors";
import {
  VaultSnapshotNotFoundError,
  VaultSnapshotSignerNotTrustedError,
} from "../__errors/unlock-vault.errors";
import { PersistedVaultMismatchError } from "../__errors/vault-snapshot.errors";

export type PersistUnlockedVaultCommandParams = {
  vaultId: string;
  unlockedVault: UnlockedVault;
};

export type PersistUnlockedVaultResult = {
  revision: number;
  revisionTimestamp: number;
  deviceId: string;
};

export class PersistUnlockedVaultUseCase {
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

  async execute(
    params: PersistUnlockedVaultCommandParams,
  ): Promise<PersistUnlockedVaultResult> {
    const { unlockedVault } = params;

    if (unlockedVault.vaultId !== params.vaultId) {
      throw new PersistedVaultMismatchError(
        params.vaultId,
        unlockedVault.vaultId,
      );
    }

    const currentVaultSnapshot =
      await this.vaultLocalRepository.getVaultSnapshot(params.vaultId);

    if (currentVaultSnapshot === null) {
      throw new VaultSnapshotNotFoundError(params.vaultId);
    }

    if (
      currentVaultSnapshot.metadata.algorithmSuiteId !==
      this.crypto.algorithmSuite.id
    ) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId: params.vaultId,
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
        params.vaultId,
        unlockedVault.deviceId,
      );
    }

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
}
