import { PasswordEntryNotFoundError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { GetUnlockedVaultSessionUseCase } from "../vault-session/get-unlocked-vault-session";

export type GetEntryPasswordCommandParams = {
  vaultId: string;
  entryId: string;
};

export type GetEntryPasswordResult = {
  password: string;
};

export class GetEntryPasswordUseCase {
  private readonly getUnlockedVaultSession: GetUnlockedVaultSessionUseCase;

  constructor(getUnlockedVaultSession: GetUnlockedVaultSessionUseCase) {
    this.getUnlockedVaultSession = getUnlockedVaultSession;
  }

  async execute(
    params: GetEntryPasswordCommandParams,
  ): Promise<GetEntryPasswordResult> {
    const unlockedVaultSession = await this.getUnlockedVaultSession.execute();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "get entry password");
    }

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
