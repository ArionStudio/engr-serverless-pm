import type { CapturedLoginRepositoryPort } from "../../ports/browser-login/captured-login-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
export class DismissCapturedLoginUseCase {
  private readonly session: UnlockedVaultSessionService;
  private readonly captured: CapturedLoginRepositoryPort;
  constructor(
    session: UnlockedVaultSessionService,
    captured: CapturedLoginRepositoryPort,
  ) {
    this.session = session;
    this.captured = captured;
  }
  async execute(params: {
    readonly vaultId: string;
    readonly tabId: number;
    readonly id: string;
  }): Promise<void> {
    return this.session.runWithUnlockedVaultContext(
      params.vaultId,
      "dismiss captured login",
      async () => this.captured.remove(params.tabId, params.id),
    );
  }
}
