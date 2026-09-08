import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import { PasswordEntryNotFoundError } from "../../errors/vault-entry.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export type ReadEntryForEditingResult = { entry: PasswordEntry };

// Explicit secret read: metadata, password and version come from one context.
export class ReadEntryForEditingUseCase {
  private readonly session: UnlockedVaultSessionService;
  constructor(session: UnlockedVaultSessionService) {
    this.session = session;
  }

  async execute({
    vaultId,
    entryId,
  }: {
    vaultId: string;
    entryId: string;
  }): Promise<ReadEntryForEditingResult> {
    return this.session.runWithUnlockedVaultContext(
      vaultId,
      "read entry for editing",
      ({ unlockedVault }) => {
        const entry = unlockedVault.vault.entries.find(
          (candidate) => candidate.id === entryId,
        );
        if (!entry) throw new PasswordEntryNotFoundError(vaultId, entryId);
        return Promise.resolve({
          entry: {
            ...entry,
            tags: [...entry.tags],
            versionVector: { ...entry.versionVector },
          },
        });
      },
    );
  }
}
