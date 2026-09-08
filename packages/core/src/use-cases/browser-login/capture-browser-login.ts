import type {
  CaptureBrowserLoginCommand,
  CaptureBrowserLoginResult,
} from "../../domain/browser-login/browser-login.type";
import {
  browserLoginOrigin,
  matchesLoginOrigin,
} from "../../domain/browser-login/browser-login.policy";
import { passwordEntryInputSchema } from "../../domain/entry/password-entry.schema";
import { sanitizeEntryUrl } from "../../domain/entry/sanitized-entry-url.utils";
import type { CapturedLoginRepositoryPort } from "../../ports/browser-login/captured-login-repository.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { IdPort } from "../../ports/system/id.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export class CaptureBrowserLoginUseCase {
  private readonly session: UnlockedVaultSessionService;
  private readonly captured: CapturedLoginRepositoryPort;
  private readonly clock: ClockPort;
  private readonly ids: IdPort;
  constructor(
    session: UnlockedVaultSessionService,
    captured: CapturedLoginRepositoryPort,
    clock: ClockPort,
    ids: IdPort,
  ) {
    this.session = session;
    this.captured = captured;
    this.clock = clock;
    this.ids = ids;
  }
  async execute(
    params: CaptureBrowserLoginCommand,
  ): Promise<CaptureBrowserLoginResult> {
    if (
      !Number.isFinite(params.deadlineEpochMs) ||
      params.deadlineEpochMs <= this.clock.now() ||
      !Number.isInteger(params.tabId) ||
      params.tabId < 0 ||
      !browserLoginOrigin(params.url) ||
      (!params.password && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.login)) ||
      params.url.length > 8192
    )
      return { captured: false };
    const sanitizedUrl = sanitizeEntryUrl(params.url);
    const isPasswordOnly = params.login === "" && params.password !== "";
    if (
      !passwordEntryInputSchema.shape.password.safeParse(params.password)
        .success ||
      (!isPasswordOnly &&
        !passwordEntryInputSchema.shape.login.safeParse(params.login)
          .success) ||
      !passwordEntryInputSchema.shape.sanitizedUrl.safeParse(sanitizedUrl)
        .success
    )
      return { captured: false };
    const active = await this.session.get();
    if (!active) return { captured: false };
    return this.session.runWithUnlockedVaultContext(
      active.unlockedVault.vaultId,
      "capture website login",
      async ({ unlockedVault, sessionId }) => {
        if (
          sessionId !== active.sessionId ||
          params.deadlineEpochMs <= this.clock.now()
        )
          return { captured: false };
        if (
          unlockedVault.vault.entries.some(
            (entry) =>
              matchesLoginOrigin(entry.sanitizedUrl, params.url) &&
              entry.login === params.login &&
              (!params.password || entry.password === params.password),
          )
        )
          return { captured: false };
        const id = await this.ids.generateId();
        if (params.deadlineEpochMs <= this.clock.now())
          return { captured: false };
        await this.captured.save(
          {
            id,
            tabId: params.tabId,
            url: sanitizedUrl,
            login: params.login,
            password: params.password,
            expiresAt: params.retainForSession
              ? null
              : this.clock.now() + 120_000,
          },
          {
            vaultId: unlockedVault.vaultId,
            sessionId,
            protectionKey: unlockedVault.deviceLocalProtectionKey,
          },
        );
        return { captured: true };
      },
    );
  }
}
