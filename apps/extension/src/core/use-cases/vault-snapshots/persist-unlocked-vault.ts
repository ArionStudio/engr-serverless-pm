import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { ClockPort } from "../../ports/clock.port";
import type { CryptoPort } from "../../ports/crypto.port";
import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault-local-repository.port";
import { UnsupportedAlgorithmSuiteError } from "../__errors/algorithm-suite.errors";
import {
  VaultSnapshotNotFoundError,
  VaultSnapshotSignerNotTrustedError,
} from "../__errors/unlock-vault.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";

export type PersistUnlockedVaultCommandParams = {
  vaultId: string;
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
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(
    crypto: CryptoPort,
    clock: ClockPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
  ) {
    this.crypto = crypto;
    this.clock = clock;
    this.vaultLocalRepository = vaultLocalRepository;
    this.unlockedVaultRepository = unlockedVaultRepository;
  }

  async execute(
    params: PersistUnlockedVaultCommandParams,
  ): Promise<PersistUnlockedVaultResult> {
    const unlockedVault = await this.unlockedVaultRepository.getUnlockedVault();

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "snapshot persist");
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
