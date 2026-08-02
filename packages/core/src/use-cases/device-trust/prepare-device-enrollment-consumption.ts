import type { DeviceProfileReviewItem } from "../../domain/sync/device-profile-review.type";
import { findChangedDeviceProfiles } from "../../domain/sync/device-profile-review.utils";
import type { EntryReviewItem } from "../../domain/sync/entry-review.type";
import { findChangedEntries } from "../../domain/sync/entry-review.utils";
import type { TagReviewItem } from "../../domain/sync/tag-review.type";
import { findChangedTags } from "../../domain/sync/tag-review.utils";
import {
  cloneVaultSnapshotDescriptor,
  toVaultSnapshotDescriptor,
  type VaultSnapshotDescriptor,
} from "../../domain/snapshot";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../../services/sync";
import { DeviceEnrollmentConsumptionService } from "../../services/trust/device-enrollment-consumption.service";

export type PrepareDeviceEnrollmentConsumptionCommandParams = {
  readonly vaultId: string;
};

export type PrepareDeviceEnrollmentConsumptionResult = {
  readonly localSnapshotDescriptor: VaultSnapshotDescriptor;
  readonly remoteSnapshotDescriptor: VaultSnapshotDescriptor;
  readonly enrolledDeviceIds: readonly string[];
  readonly vaultKeyGeneration: number;
  readonly review: {
    readonly entryReviews: readonly EntryReviewItem[];
    readonly tagReviews: readonly TagReviewItem[];
    readonly deviceProfileReviews: readonly DeviceProfileReviewItem[];
  };
};

export class PrepareDeviceEnrollmentConsumptionUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly enrollmentConsumption: DeviceEnrollmentConsumptionService;

  constructor(
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultSyncGuard: VaultSyncGuardService,
  ) {
    this.unlockedVaultSession = unlockedVaultSession;
    this.enrollmentConsumption = new DeviceEnrollmentConsumptionService(
      crypto,
      syncProvider,
      vaultSnapshot,
      vaultSyncGuard,
    );
  }

  async execute(
    params: PrepareDeviceEnrollmentConsumptionCommandParams,
  ): Promise<PrepareDeviceEnrollmentConsumptionResult> {
    const { sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "prepare device enrollment consumption",
      );
    const candidate = await this.enrollmentConsumption.loadVerifiedCandidate({
      vaultId: params.vaultId,
      operation: "prepare device enrollment consumption",
      unlockedVault,
      sourceSnapshotVersionVector,
    });

    return {
      localSnapshotDescriptor: toVaultSnapshotDescriptor(
        params.vaultId,
        candidate.localSnapshot,
      ),
      remoteSnapshotDescriptor: cloneVaultSnapshotDescriptor(
        candidate.remoteSnapshotDescriptor,
      ),
      enrolledDeviceIds: candidate.transitions.map(
        (transition) => transition.enrolledDeviceId,
      ),
      vaultKeyGeneration: candidate.remoteSnapshot.metadata.vaultKeyGeneration,
      review: {
        entryReviews: findChangedEntries(
          candidate.enrollmentBaseline,
          candidate.remoteVault,
        ),
        tagReviews: findChangedTags(
          candidate.enrollmentBaseline,
          candidate.remoteVault,
        ),
        deviceProfileReviews: findChangedDeviceProfiles(
          candidate.enrollmentBaseline,
          candidate.remoteVault,
        ),
      },
    };
  }
}
