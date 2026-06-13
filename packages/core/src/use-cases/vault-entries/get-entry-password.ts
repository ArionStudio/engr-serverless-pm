import { PasswordEntryNotFoundError } from "../../errors/vault-entry.errors";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";

export type GetEntryPasswordCommandParams = {
  vaultId: string;
  entryId: string;
};

export type GetEntryPasswordResult = {
  password: string;
};

export class GetEntryPasswordUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;

  constructor(unlockedVaultSession: UnlockedVaultSessionService) {
    this.unlockedVaultSession = unlockedVaultSession;
  }

  async execute(
    params: GetEntryPasswordCommandParams,
  ): Promise<GetEntryPasswordResult> {
    const { unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "get entry password",
      );

    const entry = unlockedVault.vault.entries.find(
      (candidate) => candidate.id === params.entryId,
    );

    if (entry === undefined) {
      throw new PasswordEntryNotFoundError(params.vaultId, params.entryId);
    }

    return {
      password: entry.password,
    };
  }
}
