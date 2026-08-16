import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export type GetVaultSessionStatusResult =
  | {
      status: "locked";
    }
  | {
      status: "unlocked";
      vaultId: string;
    };

export class GetVaultSessionStatusUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;

  constructor(unlockedVaultSession: UnlockedVaultSessionService) {
    this.unlockedVaultSession = unlockedVaultSession;
  }

  async execute(): Promise<GetVaultSessionStatusResult> {
    const vaultId = await this.unlockedVaultSession.getActiveVaultId();

    if (vaultId === null) {
      return {
        status: "locked",
      };
    }

    return {
      status: "unlocked",
      vaultId,
    };
  }
}
