import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionInvalidError,
} from "../../ports/vault/unlocked-vault-repository.errors";
import type { UnlockedVaultRepositoryPort } from "../../ports/vault/unlocked-vault-repository.port";

export type CommitUnlockedVaultSessionCommandParams = {
  readonly unlockedVault: UnlockedVault;
  readonly sourceSnapshotRevision: number;
};

export class CommitUnlockedVaultSessionUseCase {
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(unlockedVaultRepository: UnlockedVaultRepositoryPort) {
    this.unlockedVaultRepository = unlockedVaultRepository;
  }

  async execute(
    params: CommitUnlockedVaultSessionCommandParams,
  ): Promise<void> {
    try {
      await this.unlockedVaultRepository.saveUnlockedVaultSession({
        unlockedVault: params.unlockedVault,
        sourceSnapshotRevision: params.sourceSnapshotRevision,
      });
    } catch (error) {
      if (!this.shouldCleanupAfterCommitFailure(error)) {
        throw error;
      }

      try {
        await this.unlockedVaultRepository.removeUnlockedVaultSession();
      } catch {
        // Preserve the session commit failure as the root cause.
      }

      throw error;
    }
  }

  private shouldCleanupAfterCommitFailure(error: unknown): boolean {
    return !(
      error instanceof ActiveUnlockedVaultMismatchError ||
      error instanceof UnlockedVaultSessionInvalidError
    );
  }
}
