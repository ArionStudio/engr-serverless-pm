import type { DeviceProfileReviewItem } from "../../domain/sync/device-profile-review.type";
import { findChangedDeviceProfiles } from "../../domain/sync/device-profile-review.utils";
import { toVisibleEntryReviewItem } from "../../domain/sync/entry-review.mapper";
import type { VisibleEntryReviewItem } from "../../domain/sync/entry-review.type";
import { findChangedEntries } from "../../domain/sync/entry-review.utils";
import type { SyncSetupInput } from "../../domain/sync";
import type { TagReviewItem } from "../../domain/sync/tag-review.type";
import { findChangedTags } from "../../domain/sync/tag-review.utils";
import {
  cloneVaultSnapshotDescriptor,
  toVaultSnapshotDescriptor,
  type ReviewedVaultSnapshotDescriptors,
} from "../../domain/snapshot";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { DeviceRevocationConsumptionService } from "../../services/trust/device-revocation-consumption.service";

export type PrepareDeviceRevocationConsumptionCommandParams = {
  readonly vaultId: string;
  readonly replacementSyncConfig: SyncSetupInput;
};

export type PrepareDeviceRevocationConsumptionResult = {
  readonly reviewedSnapshotDescriptors: ReviewedVaultSnapshotDescriptors;
  readonly revokedDeviceIds: readonly string[];
  readonly enrolledDeviceIds: readonly string[];
  readonly vaultKeyGeneration: number;
  readonly review: {
    readonly entryReviews: readonly VisibleEntryReviewItem[];
    readonly tagReviews: readonly TagReviewItem[];
    readonly deviceProfileReviews: readonly DeviceProfileReviewItem[];
  };
};

export class PrepareDeviceRevocationConsumptionUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly revocationConsumption: DeviceRevocationConsumptionService;

  constructor(
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.unlockedVaultSession = unlockedVaultSession;
    this.revocationConsumption = new DeviceRevocationConsumptionService(
      crypto,
      syncProvider,
      vaultSnapshot,
      vaultLocalRepository,
    );
  }

  async execute(
    params: PrepareDeviceRevocationConsumptionCommandParams,
  ): Promise<PrepareDeviceRevocationConsumptionResult> {
    const { sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "prepare device revocation consumption",
      );
    const candidate = await this.revocationConsumption.loadVerifiedCandidate({
      vaultId: params.vaultId,
      replacementSyncConfig: params.replacementSyncConfig,
      unlockedVault,
      sourceSnapshotVersionVector,
    });

    return {
      reviewedSnapshotDescriptors: {
        local: toVaultSnapshotDescriptor(
          params.vaultId,
          candidate.localSnapshot,
        ),
        remote: cloneVaultSnapshotDescriptor(
          candidate.remoteSnapshotDescriptor,
        ),
      },
      revokedDeviceIds: candidate.revocations.map(
        (transition) => transition.revokedDeviceId,
      ),
      enrolledDeviceIds: candidate.enrollments.map(
        (transition) => transition.enrolledDeviceId,
      ),
      vaultKeyGeneration: candidate.remoteSnapshot.metadata.vaultKeyGeneration,
      review: {
        entryReviews: findChangedEntries(
          candidate.trustTransitionBaseline,
          candidate.remoteVault,
        ).map(toVisibleEntryReviewItem),
        tagReviews: findChangedTags(
          candidate.trustTransitionBaseline,
          candidate.remoteVault,
        ),
        deviceProfileReviews: findChangedDeviceProfiles(
          candidate.trustTransitionBaseline,
          candidate.remoteVault,
        ),
      },
    };
  }
}
