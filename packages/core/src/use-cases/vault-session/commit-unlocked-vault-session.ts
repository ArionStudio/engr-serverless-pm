import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionInvalidError,
} from "../__errors/vault-session.errors";
import type { RemoveUnlockedVaultSessionUseCase } from "./remove-unlocked-vault-session";
import type { SaveUnlockedVaultSessionUseCase } from "./save-unlocked-vault-session";

export type CommitUnlockedVaultSessionCommandParams = {
  readonly unlockedVault: UnlockedVault;
  readonly sourceSnapshotRevision: number;
};

export class CommitUnlockedVaultSessionUseCase {
  private readonly saveUnlockedVaultSession: SaveUnlockedVaultSessionUseCase;
  private readonly removeUnlockedVaultSession: RemoveUnlockedVaultSessionUseCase;

  constructor(
    saveUnlockedVaultSession: SaveUnlockedVaultSessionUseCase,
    removeUnlockedVaultSession: RemoveUnlockedVaultSessionUseCase,
  ) {
    this.saveUnlockedVaultSession = saveUnlockedVaultSession;
    this.removeUnlockedVaultSession = removeUnlockedVaultSession;
  }

  async execute(
    params: CommitUnlockedVaultSessionCommandParams,
  ): Promise<void> {
    try {
      await this.saveUnlockedVaultSession.execute({
        session: {
          unlockedVault: params.unlockedVault,
          sourceSnapshotRevision: params.sourceSnapshotRevision,
        },
      });
    } catch (error) {
      if (!this.shouldCleanupAfterCommitFailure(error)) {
        throw error;
      }

      try {
        await this.removeUnlockedVaultSession.execute();
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
