import type { BrowserLoginTarget } from "../../domain/browser-login/browser-login.type";
import { matchesLoginOrigin } from "../../domain/browser-login/browser-login.policy";
import type { BrowserLoginPort } from "../../ports/browser-login/browser-login.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export class FillBrowserLoginUseCase {
  private readonly session: UnlockedVaultSessionService;
  private readonly browser: BrowserLoginPort;
  constructor(session: UnlockedVaultSessionService, browser: BrowserLoginPort) {
    this.session = session;
    this.browser = browser;
  }
  async execute(params: {
    readonly vaultId: string;
    readonly entryId: string;
    readonly target: BrowserLoginTarget;
  }): Promise<void> {
    return this.session.runWithUnlockedVaultContext(
      params.vaultId,
      "fill website login",
      async ({ unlockedVault }) => {
        const entry = unlockedVault.vault.entries.find(
          (entry) => entry.id === params.entryId,
        );
        if (
          !entry ||
          !params.target.fillable ||
          !["identifier", "sign-in"].includes(params.target.form?.kind ?? "") ||
          !matchesLoginOrigin(entry.sanitizedUrl, params.target.url)
        )
          throw new Error("Login does not match this page.");
        await this.browser.fill(params.target, {
          login: entry.login,
          password:
            params.target.form?.kind === "identifier" ? "" : entry.password,
        });
      },
    );
  }
}
