import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import { ActiveUnlockedVaultMismatchError } from "../../use-cases/__errors/vault-session.errors";
import type { RemoveUnlockedVaultSessionService } from "./remove-unlocked-vault-session.service";
import type { SaveUnlockedVaultSessionService } from "./save-unlocked-vault-session.service";

export class CommitUnlockedVaultSessionService {
  private readonly saveUnlockedVaultSession: SaveUnlockedVaultSessionService;
  private readonly removeUnlockedVaultSession: RemoveUnlockedVaultSessionService;

  constructor(
    saveUnlockedVaultSession: SaveUnlockedVaultSessionService,
    removeUnlockedVaultSession: RemoveUnlockedVaultSessionService,
  ) {
    this.saveUnlockedVaultSession = saveUnlockedVaultSession;
    this.removeUnlockedVaultSession = removeUnlockedVaultSession;
  }

  async commit(
    unlockedVault: UnlockedVault,
    sourceSnapshotRevision: number,
  ): Promise<void> {
    try {
      await this.saveUnlockedVaultSession.save({
        unlockedVault,
        sourceSnapshotRevision,
      });
    } catch (error) {
      if (!this.shouldCleanupAfterCommitFailure(error)) {
        throw error;
      }

      try {
        await this.removeUnlockedVaultSession.remove();
      } catch {
        // Preserve the session commit failure as the root cause.
      }

      throw error;
    }
  }

  private shouldCleanupAfterCommitFailure(error: unknown): boolean {
    return !(error instanceof ActiveUnlockedVaultMismatchError);
  }
}
