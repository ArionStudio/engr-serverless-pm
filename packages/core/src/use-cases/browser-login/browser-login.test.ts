import type { CapturedLoginRepositoryPort } from "../../ports/browser-login/captured-login-repository.port";
import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  saveUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import type {
  BrowserLoginTarget,
  CapturedLogin,
} from "../../domain/browser-login/browser-login.type";
import type { BrowserLoginPort } from "../../ports/browser-login/browser-login.port";
import { CaptureBrowserLoginUseCase } from "./capture-browser-login";
import { FillBrowserLoginUseCase } from "./fill-browser-login";
import { HasCapturedLoginUseCase } from "./has-captured-login";
import { ReadBrowserLoginsUseCase } from "./read-browser-logins";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  saveUnlockedVaultWithEntries(ports, values, [singlePasswordEntry]);
  const target: BrowserLoginTarget = {
    tabId: 7,
    url: "https://example.com/sign-in",
    documentToken: "document-identity",
    fillable: true,
    form: { kind: "sign-in" as const, fields: ["current-password" as const] },
    formToken: "form-1",
  };
  const browser: BrowserLoginPort = {
    inspect: vi.fn(async () => target),
    fill: vi.fn(async () => undefined),
  };
  const captured: CapturedLoginRepositoryPort = {
    save: vi.fn(async () => undefined),
    read: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
  };
  const session = ports.sessionServices.unlockedVaultSession;
  return {
    values,
    ports,
    target,
    browser,
    captured,
    capture: new CaptureBrowserLoginUseCase(
      session,
      captured,
      ports.clock,
      ports.ids,
    ),
    fill: new FillBrowserLoginUseCase(session, browser),
    read: new ReadBrowserLoginsUseCase(session, browser, captured, ports.clock),
  };
}

describe("browser login use cases", () => {
  it("fills only an exact origin match and passes the inspected document identity to the browser boundary", async () => {
    const ctx = createContext();
    for (const url of [
      "https://example.com.evil.test/",
      "https://sub.example.com/",
      "http://example.com/",
      "https://example.com:8443/",
    ]) {
      await expect(
        ctx.fill.execute({
          vaultId: ctx.values.vaultId,
          entryId: singlePasswordEntry.id,
          target: { ...ctx.target, url },
        }),
      ).rejects.toThrow();
    }
    expect(ctx.browser.fill).not.toHaveBeenCalled();
    await ctx.fill.execute({
      vaultId: ctx.values.vaultId,
      entryId: singlePasswordEntry.id,
      target: ctx.target,
    });
    expect(ctx.browser.fill).toHaveBeenCalledWith(ctx.target, {
      login: singlePasswordEntry.login,
      password: singlePasswordEntry.password,
    });
  });

  it("does not release a password after locking or for an unavailable form", async () => {
    const ctx = createContext();
    await expect(
      ctx.fill.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        target: { ...ctx.target, fillable: false },
      }),
    ).rejects.toThrow();
    await ctx.ports.sessionServices.unlockedVaultSession.remove();
    await expect(
      ctx.fill.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        target: ctx.target,
      }),
    ).rejects.toThrow();
    expect(ctx.browser.fill).not.toHaveBeenCalled();
  });

  it("authorizes the requested vault before inspecting the browser page", async () => {
    const ctx = createContext();
    await expect(
      ctx.read.execute({ vaultId: "another-vault" }),
    ).rejects.toThrow();
    await ctx.ports.sessionServices.unlockedVaultSession.remove();
    await expect(
      ctx.read.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toThrow();
    expect(ctx.browser.inspect).not.toHaveBeenCalled();
    expect(ctx.captured.read).not.toHaveBeenCalled();
  });

  it.each(["locked", "replaced"] as const)(
    "rejects late inspection after the original session is %s",
    async (state) => {
      const ctx = createContext();
      let finishInspection!: (target: BrowserLoginTarget) => void;
      vi.mocked(ctx.browser.inspect).mockImplementation(
        () =>
          new Promise((resolve) => {
            finishInspection = resolve;
          }),
      );
      const reading = ctx.read.execute({ vaultId: ctx.values.vaultId });
      const rejected = expect(reading).rejects.toThrow();
      await vi.waitFor(() =>
        expect(ctx.browser.inspect).toHaveBeenCalledOnce(),
      );
      await ctx.ports.sessionServices.unlockedVaultSession.remove();
      if (state === "replaced") {
        saveUnlockedVaultWithEntries(
          ctx.ports,
          { ...ctx.values, sessionId: "replacement-session" },
          [singlePasswordEntry],
        );
      }
      finishInspection(ctx.target);
      await rejected;
      expect(ctx.captured.read).not.toHaveBeenCalled();
    },
  );

  it("offers review without changing the vault and binds captured data to the unlocked session", async () => {
    const ctx = createContext();
    const result = await ctx.capture.execute({
      deadlineEpochMs: createCoreTestValues().timestamp + 5_000,
      tabId: 7,
      url: "https://example.com/login?token=private#secret",
      login: singlePasswordEntry.login,
      password: "changed-password",
    });
    expect(result).toEqual({ captured: true });
    expect(ctx.captured.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 7,
        url: "https://example.com/login",
        password: "changed-password",
        expiresAt: ctx.values.timestamp + 120_000,
      }),
      {
        vaultId: ctx.values.vaultId,
        sessionId: ctx.values.sessionId,
        protectionKey: ctx.values.deviceLocalProtectionKey,
      },
    );
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.entries[0]
        .password,
    ).toBe(singlePasswordEntry.password);
  });

  it("does not retain existing credentials, insecure captures, oversize secrets or captures while locked", async () => {
    const ctx = createContext();
    const request = {
      deadlineEpochMs: ctx.values.timestamp + 5_000,
      tabId: 7,
      url: ctx.target.url,
      login: singlePasswordEntry.login,
      password: singlePasswordEntry.password,
    };
    expect(await ctx.capture.execute(request)).toEqual({ captured: false });
    expect(
      await ctx.capture.execute({ ...request, url: "http://example.com/" }),
    ).toEqual({ captured: false });
    expect(
      await ctx.capture.execute({ ...request, password: "x".repeat(4097) }),
    ).toEqual({ captured: false });
    await ctx.ports.sessionServices.unlockedVaultSession.remove();
    expect(await ctx.capture.execute({ ...request, password: "new" })).toEqual({
      captured: false,
    });
    expect(ctx.captured.save).not.toHaveBeenCalled();
  });

  it("accepts entry field limits and rejects values that cannot be saved as an entry before generating an ID", async () => {
    const urlPrefix = "https://example.com/";
    const atLimit = {
      deadlineEpochMs: createCoreTestValues().timestamp + 5_000,
      tabId: 7,
      url: `${urlPrefix}${"u".repeat(512 - urlPrefix.length)}`,
      login: "l".repeat(128),
      password: "p".repeat(512),
    };
    const accepted = createContext();
    expect(await accepted.capture.execute(atLimit)).toEqual({ captured: true });
    expect(accepted.captured.save).toHaveBeenCalledWith(
      expect.objectContaining({
        url: atLimit.url,
        login: atLimit.login,
        password: atLimit.password,
      }),
      expect.any(Object),
    );

    for (const request of [
      { ...atLimit, password: `${atLimit.password}p` },
      { ...atLimit, login: `${atLimit.login}l` },
      { ...atLimit, url: `${atLimit.url}u` },
    ]) {
      const rejected = createContext();
      expect(await rejected.capture.execute(request)).toEqual({
        captured: false,
      });
      expect(rejected.captured.save).not.toHaveBeenCalled();
      expect(rejected.ports.ids.generateId).not.toHaveBeenCalled();
    }
  });

  it("lists matching accounts without their passwords and identifies only the captured account for update", async () => {
    const ctx = createContext();
    const captured: CapturedLogin = {
      id: "capture",
      tabId: 7,
      url: ctx.target.url,
      login: singlePasswordEntry.login,
      password: "new",
      expiresAt: ctx.values.timestamp + 1000,
    };
    vi.mocked(ctx.captured.read).mockResolvedValue(captured);
    const result = await ctx.read.execute({ vaultId: ctx.values.vaultId });
    expect(result.entries).toEqual([
      {
        id: singlePasswordEntry.id,
        login: singlePasswordEntry.login,
        url: singlePasswordEntry.sanitizedUrl,
      },
    ]);
    expect(result.captured).toEqual(captured);
    expect(result.updateEntryIds).toEqual([singlePasswordEntry.id]);
  });

  it("discards expired, other-origin and already-saved captured credentials before presenting them", async () => {
    const ctx = createContext();
    const captured: CapturedLogin = {
      id: "capture",
      tabId: 7,
      url: ctx.target.url,
      login: singlePasswordEntry.login,
      password: "new",
      expiresAt: ctx.values.timestamp + 1000,
    };
    for (const stale of [
      { ...captured, expiresAt: ctx.values.timestamp },
      { ...captured, url: "https://another.example/" },
      { ...captured, password: singlePasswordEntry.password },
    ]) {
      vi.mocked(ctx.captured.read).mockResolvedValueOnce(stale);
      const result = await ctx.read.execute({ vaultId: ctx.values.vaultId });
      expect(result.captured).toBeNull();
      expect(result.updateEntryIds).toEqual([]);
    }
    expect(ctx.captured.remove).toHaveBeenCalledTimes(3);
  });
  it("sends no password for an identifier-only step and refuses registration targets", async () => {
    const ctx = createContext();
    const identifier: BrowserLoginTarget = {
      ...ctx.target,
      form: { kind: "identifier", fields: ["email"] },
    };
    await ctx.fill.execute({
      vaultId: ctx.values.vaultId,
      entryId: singlePasswordEntry.id,
      target: identifier,
    });
    expect(ctx.browser.fill).toHaveBeenCalledWith(identifier, {
      login: singlePasswordEntry.login,
      password: "",
    });
    await expect(
      ctx.fill.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
        target: {
          ...identifier,
          form: { kind: "registration", fields: ["new-password"] },
        },
      }),
    ).rejects.toThrow();
  });

  it("captures a new email-only account without replacing or duplicating an existing password login", async () => {
    const ctx = createContext();
    const request = {
      deadlineEpochMs: ctx.values.timestamp + 5_000,
      tabId: 7,
      url: ctx.target.url,
      login: singlePasswordEntry.login,
      password: "",
    };
    expect(await ctx.capture.execute(request)).toEqual({ captured: false });
    expect(ctx.captured.save).not.toHaveBeenCalled();
    expect(
      await ctx.capture.execute({ ...request, login: "new@example.com" }),
    ).toEqual({ captured: true });
    expect(ctx.captured.save).toHaveBeenCalledWith(
      expect.objectContaining({ login: "new@example.com", password: "" }),
      expect.any(Object),
    );
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.entries[0]
        .password,
    ).toBe(singlePasswordEntry.password);
  });
});

it("retains a capture after redirects and the normal timeout, matching updates only to the captured origin", async () => {
  const ctx = createContext();
  await ctx.capture.execute({
    deadlineEpochMs: createCoreTestValues().timestamp + 5_000,
    tabId: 7,
    url: ctx.target.url,
    login: singlePasswordEntry.login,
    password: "changed-password",
    retainForSession: true,
  });
  const saved = vi.mocked(ctx.captured.save).mock.calls[0][0];
  expect(saved.expiresAt).toBeNull();
  vi.mocked(ctx.captured.read).mockResolvedValue(saved);
  vi.mocked(ctx.ports.clock.now).mockReturnValue(
    ctx.values.timestamp + 600_000,
  );
  vi.mocked(ctx.browser.inspect).mockResolvedValue({
    ...ctx.target,
    url: "https://another.example/home",
    fillable: false,
    form: null,
  });
  const result = await ctx.read.execute({ vaultId: ctx.values.vaultId });
  expect(result.captured).toEqual(saved);
  expect(result.entries).toEqual([]);
  expect(result.updateEntryIds).toEqual([singlePasswordEntry.id]);
  expect(ctx.captured.remove).not.toHaveBeenCalled();
  const pending = new HasCapturedLoginUseCase(
    ctx.ports.sessionServices.unlockedVaultSession,
    ctx.captured,
    ctx.ports.clock,
  );
  expect(await pending.execute({ tabId: 7, url: ctx.target.url })).toBe(true);
  expect(
    await pending.execute({ tabId: 7, url: "https://another.example/home" }),
  ).toBe(false);
  await ctx.ports.sessionServices.unlockedVaultSession.remove();
  expect(await pending.execute({ tabId: 7, url: ctx.target.url })).toBe(false);
  await expect(
    ctx.read.execute({ vaultId: ctx.values.vaultId }),
  ).rejects.toThrow();
});

it("removes a session-retained capture already saved for its original website after a redirect", async () => {
  const ctx = createContext();
  vi.mocked(ctx.captured.read).mockResolvedValue({
    id: "saved",
    tabId: 7,
    url: ctx.target.url,
    login: singlePasswordEntry.login,
    password: singlePasswordEntry.password,
    expiresAt: null,
  });
  vi.mocked(ctx.browser.inspect).mockResolvedValue({
    ...ctx.target,
    url: "https://another.example/home",
  });
  const result = await ctx.read.execute({ vaultId: ctx.values.vaultId });
  expect(result.captured).toBeNull();
  expect(ctx.captured.remove).toHaveBeenCalledWith(7, "saved");
});

it("does not store a capture whose deadline expires while preparing its ID", async () => {
  const ctx = createContext();
  const deadlineEpochMs = ctx.values.timestamp + 100;
  vi.mocked(ctx.ports.ids.generateId)
    .mockReset()
    .mockImplementationOnce(async () => {
      vi.mocked(ctx.ports.clock.now).mockReturnValue(deadlineEpochMs);
      return "capture-id";
    });
  expect(
    await ctx.capture.execute({
      tabId: 7,
      url: ctx.target.url,
      login: "alice",
      password: "new-secret",
      deadlineEpochMs,
    }),
  ).toEqual({ captured: false });
  expect(ctx.captured.save).not.toHaveBeenCalled();
});
