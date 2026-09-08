import type { BrowserLoginPage } from "../../domain/browser-login/browser-login.type";
import { matchesLoginOrigin } from "../../domain/browser-login/browser-login.policy";
import type { CapturedLoginRepositoryPort } from "../../ports/browser-login/captured-login-repository.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
export class HasCapturedLoginUseCase {
  private readonly session: UnlockedVaultSessionService;
  private readonly captured: CapturedLoginRepositoryPort;
  private readonly clock: ClockPort;
  constructor(
    session: UnlockedVaultSessionService,
    captured: CapturedLoginRepositoryPort,
    clock: ClockPort,
  ) {
    this.session = session;
    this.captured = captured;
    this.clock = clock;
  }
  async execute({ tabId, url }: BrowserLoginPage): Promise<boolean> {
    const active = await this.session.get();
    if (!active) return false;
    return this.session.runWithUnlockedVaultContext(
      active.unlockedVault.vaultId,
      "check captured login",
      async ({ unlockedVault, sessionId }) => {
        const value = await this.captured.read(tabId, {
          vaultId: unlockedVault.vaultId,
          sessionId,
          protectionKey: unlockedVault.deviceLocalProtectionKey,
        });
        return (
          value !== null &&
          (value.expiresAt === null || value.expiresAt > this.clock.now()) &&
          matchesLoginOrigin(value.url, url)
        );
      },
    );
  }
}
