import type {
  VaultTrustChain,
  VerifiedVaultTrustState,
} from "../../domain/device-trust";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { VaultMasterKey } from "../../domain/snapshot/brand-keys";
import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { Vault } from "../../domain/vault/vault";
import type { EncryptedDeviceSyncCredentialState } from "../../domain/sync";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import {
  compareVersionVectors,
  incrementVersionVector,
} from "../../domain/versioning/version-vector.utils";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import { VaultSnapshotNotFoundError } from "../../errors/unlock-vault.errors";
import {
  PersistedVaultMismatchError,
  SnapshotSigningDeviceNotTrustedError,
  VaultSnapshotVersionMismatchError,
} from "../../errors/vault-snapshot.errors";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { VaultTrustService } from "../trust/vault-trust.service";

export class VaultSnapshotService {
  private readonly crypto: CryptoPort;
  private readonly clock: ClockPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    crypto: CryptoPort,
    clock: ClockPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.crypto = crypto;
    this.clock = clock;
    this.vaultLocalRepository = vaultLocalRepository;
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async persistUnlockedVault(
    vaultId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
    options: {
      readonly baseSnapshotVersionVector?: VersionVector;
      readonly keySlots?: UnsignedVaultSnapshot["keySlots"];
      readonly vaultKeyGeneration?: number;
      readonly syncCredentialState?: EncryptedDeviceSyncCredentialState | null;
      readonly nextTrust?: {
        readonly chain: VaultTrustChain;
        readonly state: VerifiedVaultTrustState;
      };
    } = {},
  ) {
    const currentSnapshot = await this.requireCurrentSnapshotForUnlockedVault(
      vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );
    const trustChain = options.nextTrust?.chain ?? currentSnapshot.trustChain;
    const trustState =
      options.nextTrust?.state ?? unlockedVault.trustedSnapshotContext.trust;

    if (trustChain === undefined) {
      throw new VaultTrustStateInvalidError(vaultId, "trust chain is missing");
    }

    const signingDevice = trustState.trustedDevices.find(
      (device) => device.deviceId === unlockedVault.deviceId,
    );

    if (
      signingDevice === undefined ||
      !(await this.crypto.verifyDeviceSignKeyPair(
        signingDevice.publicSignKey,
        unlockedVault.devicePrivateSignKey,
      ))
    ) {
      throw new SnapshotSigningDeviceNotTrustedError(
        vaultId,
        unlockedVault.deviceId,
      );
    }

    const unsignedSnapshot: UnsignedVaultSnapshot = {
      metadata: {
        ...currentSnapshot.metadata,
        revisionTimestamp: this.clock.now(),
        snapshotVersionVector: incrementVersionVector(
          options.baseSnapshotVersionVector ??
            currentSnapshot.metadata.snapshotVersionVector,
          unlockedVault.deviceId,
        ),
        createdByDeviceId: unlockedVault.deviceId,
        vaultKeyGeneration:
          options.vaultKeyGeneration ??
          currentSnapshot.metadata.vaultKeyGeneration,
      },
      trustChain,
      keySlots: options.keySlots ?? currentSnapshot.keySlots,
      content: await this.crypto.encryptVaultSnapshotContent(
        unlockedVault.vault,
        unlockedVault.vaultMasterKey,
      ),
    };
    const snapshot: VaultSnapshot = {
      ...unsignedSnapshot,
      signature: await this.crypto.signVaultSnapshot(
        unsignedSnapshot,
        unlockedVault.devicePrivateSignKey,
      ),
    };

    await this.vaultTrust.verifySnapshot(vaultId, snapshot, trustState);

    const snapshotDigest = await this.crypto.digestVaultSnapshot(snapshot);
    const checkpoint = await this.vaultTrust.createCheckpoint(
      snapshot,
      trustState,
      unlockedVault.deviceId,
      unlockedVault.devicePrivateSignKey,
    );

    await this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
      expectedSnapshotDigest:
        unlockedVault.trustedSnapshotContext.snapshotDigest,
      snapshot,
      checkpoint,
      ...(options.syncCredentialState === undefined
        ? {}
        : { syncCredentialState: options.syncCredentialState }),
    });

    return {
      snapshotVersionVector: snapshot.metadata.snapshotVersionVector,
      revisionTimestamp: snapshot.metadata.revisionTimestamp,
      trustedSnapshotContext: {
        snapshotDigest,
        trust: trustState,
      },
      snapshot,
    };
  }

  async requireLocalVaultSnapshot(vaultId: string): Promise<VaultSnapshot> {
    const snapshot = await this.vaultLocalRepository.getVaultSnapshot(vaultId);

    if (snapshot === null) {
      throw new VaultSnapshotNotFoundError(vaultId);
    }

    return snapshot;
  }

  async verifyCandidateSnapshotTrust(
    vaultId: string,
    snapshot: VaultSnapshot,
    unlockedVault: UnlockedVault,
  ): Promise<{
    readonly chain: VaultTrustChain;
    readonly state: VerifiedVaultTrustState;
  }> {
    this.requireSupportedSnapshotAlgorithm(vaultId, snapshot);

    if (snapshot.metadata.id !== vaultId) {
      throw new PersistedVaultMismatchError(vaultId, snapshot.metadata.id);
    }

    const state = await this.vaultTrust.verifyTrustChain(
      vaultId,
      unlockedVault.vaultTrustAnchor,
      snapshot.trustChain,
    );
    await this.vaultTrust.requireTrustDescendsFrom(
      vaultId,
      snapshot.trustChain,
      state,
      unlockedVault.trustedSnapshotContext.trust,
    );
    await this.vaultTrust.verifySnapshot(vaultId, snapshot, state);

    return { chain: snapshot.trustChain, state };
  }

  async restoreLocalVaultSnapshot(
    snapshot: VaultSnapshot,
    replacedSnapshot: VaultSnapshot,
    unlockedVault: UnlockedVault,
    syncCredentialState?: EncryptedDeviceSyncCredentialState | null,
  ): Promise<void> {
    await this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
      expectedSnapshotDigest:
        await this.crypto.digestVaultSnapshot(replacedSnapshot),
      snapshot,
      checkpoint: await this.vaultTrust.createCheckpoint(
        snapshot,
        unlockedVault.trustedSnapshotContext.trust,
        unlockedVault.deviceId,
        unlockedVault.devicePrivateSignKey,
      ),
      ...(syncCredentialState === undefined ? {} : { syncCredentialState }),
    });
  }

  async openTrustedVaultSnapshot(
    vaultId: string,
    snapshot: VaultSnapshot,
    vaultMasterKey: VaultMasterKey,
  ): Promise<Vault> {
    this.requireSupportedSnapshotAlgorithm(vaultId, snapshot);

    if (snapshot.metadata.id !== vaultId) {
      throw new PersistedVaultMismatchError(vaultId, snapshot.metadata.id);
    }

    return this.crypto.decryptVaultSnapshotContent(
      snapshot.content,
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

    const snapshot = await this.requireLocalVaultSnapshot(vaultId);

    if (
      compareVersionVectors(
        snapshot.metadata.snapshotVersionVector,
        sourceSnapshotVersionVector,
      ) !== "equal"
    ) {
      throw new VaultSnapshotVersionMismatchError(
        vaultId,
        sourceSnapshotVersionVector,
        snapshot.metadata.snapshotVersionVector,
      );
    }

    this.requireSupportedSnapshotAlgorithm(vaultId, snapshot);

    if (
      (await this.crypto.digestVaultSnapshot(snapshot)) !==
      unlockedVault.trustedSnapshotContext.snapshotDigest
    ) {
      throw new VaultSnapshotVersionMismatchError(
        vaultId,
        sourceSnapshotVersionVector,
        snapshot.metadata.snapshotVersionVector,
      );
    }

    await this.vaultTrust.verifySnapshot(
      vaultId,
      snapshot,
      unlockedVault.trustedSnapshotContext.trust,
    );

    if (
      !snapshot.keySlots.deviceSlots.some(
        (slot) => slot.deviceId === unlockedVault.deviceId,
      )
    ) {
      throw new SnapshotSigningDeviceNotTrustedError(
        vaultId,
        unlockedVault.deviceId,
      );
    }

    return snapshot;
  }

  private requireSupportedSnapshotAlgorithm(
    vaultId: string,
    snapshot: VaultSnapshot,
  ): void {
    if (snapshot.metadata.schemaVersion !== 1) {
      throw new VaultTrustStateInvalidError(
        vaultId,
        "unsupported snapshot schema version",
      );
    }

    if (snapshot.metadata.algorithmSuiteId !== this.crypto.algorithmSuite.id) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId,
        artifact: "vault snapshot",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: snapshot.metadata.algorithmSuiteId,
      });
    }
  }
}
