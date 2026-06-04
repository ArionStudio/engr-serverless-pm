import type { GetUnlockedVaultSessionUseCase } from "./get-unlocked-vault-session";

export type GetVaultSessionStatusResult =
  | {
      status: "locked";
    }
  | {
      status: "unlocked";
      vaultId: string;
    };

export class GetVaultSessionStatusUseCase {
  private readonly getUnlockedVaultSession: GetUnlockedVaultSessionUseCase;

  constructor(getUnlockedVaultSession: GetUnlockedVaultSessionUseCase) {
    this.getUnlockedVaultSession = getUnlockedVaultSession;
  }

  async execute(): Promise<GetVaultSessionStatusResult> {
    const unlockedVaultSession = await this.getUnlockedVaultSession.execute();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault === undefined) {
      return {
        status: "locked",
      };
    }

    return {
      status: "unlocked",
      vaultId: unlockedVault.vaultId,
    };
  }
}
