import type { CapturedLoginRepositoryPort } from "../../ports/browser-login/captured-login-repository.port";
import { VaultMustBeUnlockedError } from "../../errors";
import type { BrowserLogins } from "../../domain/browser-login/browser-login.type";
import { matchesLoginOrigin } from "../../domain/browser-login/browser-login.policy";
import type { BrowserLoginPort } from "../../ports/browser-login/browser-login.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export class ReadBrowserLoginsUseCase {
  private readonly session: UnlockedVaultSessionService;
  private readonly browser: BrowserLoginPort;
  private readonly captured: CapturedLoginRepositoryPort;
  private readonly clock: ClockPort;
  constructor(
    session: UnlockedVaultSessionService,
    browser: BrowserLoginPort,
    captured: CapturedLoginRepositoryPort,
    clock: ClockPort,
  ) {
    this.session = session;
    this.browser = browser;
    this.captured = captured;
    this.clock = clock;
  }
  async execute({
    vaultId,
  }: {
    readonly vaultId: string;
  }): Promise<BrowserLogins> {
    // Authorize before inspection, but release the session lock while waiting
    // on the page. Reauthorize before reading any private vault data.
    const { sessionId: authorizedSessionId } =
      await this.session.requireUnlockedVaultContext(
        vaultId,
        "inspect website logins",
      );
    const target = await this.browser.inspect();
    return this.session.runWithUnlockedVaultContext(
      vaultId,
      "read website logins",
      async ({ unlockedVault, sessionId }) => {
        if (sessionId !== authorizedSessionId)
          throw new VaultMustBeUnlockedError(vaultId, "read website logins");
        if (!target)
          return {
            target: null,
            entries: [],
            captured: null,
            updateEntryIds: [],
          };
        const matches = unlockedVault.vault.entries.filter((entry) =>
          matchesLoginOrigin(entry.sanitizedUrl, target.url),
        );
        let captured = await this.captured.read(target.tabId, {
          vaultId,
          sessionId,
          protectionKey: unlockedVault.deviceLocalProtectionKey,
        });
        const capturedUrl = captured?.url;
        const capturedMatches = capturedUrl
          ? unlockedVault.vault.entries.filter((entry) =>
              matchesLoginOrigin(entry.sanitizedUrl, capturedUrl),
            )
          : [];
        if (
          captured &&
          ((captured.expiresAt !== null &&
            (captured.expiresAt <= this.clock.now() ||
              !matchesLoginOrigin(captured.url, target.url))) ||
            capturedMatches.some(
              (entry) =>
                entry.login === captured?.login &&
                (!captured.password || entry.password === captured.password),
            ))
        ) {
          await this.captured.remove(target.tabId, captured.id);
          captured = null;
        }
        return {
          target,
          entries: matches.map((entry) => ({
            id: entry.id,
            login: entry.login,
            url: entry.sanitizedUrl,
          })),
          captured,
          updateEntryIds: captured?.password
            ? capturedMatches
                .filter((entry) => entry.login === captured.login)
                .map((entry) => entry.id)
            : [],
        };
      },
    );
  }
}
