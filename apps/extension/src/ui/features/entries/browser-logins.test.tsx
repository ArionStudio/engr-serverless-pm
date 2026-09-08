// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserLoginsPanel } from "./browser-logins.view";
import { galleryBrowserLogins } from "@/gallery/browser-login-fixture";
afterEach(cleanup);
it("fills only the selected login after a click and reports a safe failure", async () => {
  const capabilities = galleryBrowserLogins();
  capabilities.fill = vi
    .fn()
    .mockRejectedValue(new Error("provider detail that must stay private"));
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
    />,
  );
  await screen.findByRole("button", { name: "Fill" });
  expect(capabilities.fill).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Fill" }));
  await screen.findByText(
    "Could not fill this login. Reopen the page and try again.",
  );
  expect(
    screen.queryByText("provider detail that must stay private"),
  ).not.toBeInTheDocument();
  expect(capabilities.fill).toHaveBeenCalledWith(
    "vault",
    "entry-1",
    expect.objectContaining({
      url: "https://example.com/login",
      documentToken: "gallery",
    }),
  );
});

it("keeps a website inspection failure separate from vault authorization loss", async () => {
  const capabilities = galleryBrowserLogins();
  capabilities.read = vi
    .fn()
    .mockRejectedValue(new Error("Active tab inspection failed"));
  capabilities.inspectAuthorization = vi.fn(async () => {});
  const onSessionLost = vi.fn();
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
      onSessionLost={onSessionLost}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not read this page. Reopen the popup to try again.",
  );
  expect(capabilities.inspectAuthorization).toHaveBeenCalledWith("vault");
  expect(onSessionLost).not.toHaveBeenCalled();
});

it("clears login data and reports a confirmed authorization loss", async () => {
  const capabilities = galleryBrowserLogins();
  const authorizationError = new Error("session expired");
  authorizationError.name = "UnlockedVaultSessionExpiredError";
  capabilities.fill = vi.fn().mockRejectedValue(authorizationError);
  capabilities.inspectAuthorization = vi.fn(async () => {});
  const onSessionLost = vi.fn();
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
      onSessionLost={onSessionLost}
    />,
  );
  await screen.findByText("alex@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Fill" }));
  await waitFor(() => expect(onSessionLost).toHaveBeenCalledOnce());
  expect(screen.queryByText("alex@example.com")).not.toBeInTheDocument();
  expect(capabilities.inspectAuthorization).not.toHaveBeenCalled();
});

it("reports session loss when authorization cannot be verified", async () => {
  const capabilities = galleryBrowserLogins("authorization-lost");
  capabilities.inspectAuthorization = vi.fn(capabilities.inspectAuthorization);
  const onSessionLost = vi.fn();
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
      onSessionLost={onSessionLost}
    />,
  );
  await waitFor(() => expect(onSessionLost).toHaveBeenCalledOnce());
  expect(capabilities.inspectAuthorization).toHaveBeenCalledWith("vault");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("rechecks a captured login before review and never passes expired credentials to the editor", async () => {
  const capabilities = galleryBrowserLogins("save");
  const onReview = vi.fn();
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={onReview}
      mode="detected"
    />,
  );
  await screen.findByText("Save this login?");
  await capabilities.dismiss("vault", 1, "capture-1");
  fireEvent.click(screen.getByRole("button", { name: "Review new login" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("expired"),
  );
  expect(onReview).not.toHaveBeenCalled();
});

it("does not return captured credentials after the panel changes vault", async () => {
  const capabilities = galleryBrowserLogins("save");
  const originalRead = capabilities.read;
  let finishReview:
    | ((value: Awaited<ReturnType<typeof originalRead>>) => void)
    | undefined;
  capabilities.read = vi
    .fn()
    .mockImplementationOnce(originalRead)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishReview = resolve;
        }),
    )
    .mockImplementation(originalRead);
  const onReview = vi.fn();
  const { rerender } = render(
    <BrowserLoginsPanel
      vaultId="vault-one"
      capabilities={capabilities}
      onReview={onReview}
      mode="detected"
    />,
  );
  await screen.findByText("Save this login?");
  fireEvent.click(screen.getByRole("button", { name: "Review new login" }));
  await waitFor(() => expect(capabilities.read).toHaveBeenCalledTimes(2));
  rerender(
    <BrowserLoginsPanel
      vaultId="vault-two"
      capabilities={capabilities}
      onReview={onReview}
      mode="detected"
    />,
  );
  finishReview?.(await originalRead("vault-one"));
  await waitFor(() => expect(capabilities.read).toHaveBeenCalledTimes(3));
  expect(onReview).not.toHaveBeenCalled();
});

it("does not restart the page read when the session-loss callback changes", async () => {
  const capabilities = galleryBrowserLogins("save");
  capabilities.read = vi.fn(capabilities.read);
  const onReview = vi.fn();
  const { rerender } = render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={onReview}
      onSessionLost={() => {}}
      mode="detected"
    />,
  );
  await screen.findByText("Save this login?");
  expect(capabilities.read).toHaveBeenCalledOnce();

  rerender(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={onReview}
      onSessionLost={() => {}}
      mode="detected"
    />,
  );

  await waitFor(() => expect(capabilities.read).toHaveBeenCalledOnce());
  expect(screen.getByText("Save this login?")).toBeInTheDocument();
});

it("enables session retention through its label only after login detection is enabled", async () => {
  const capabilities = galleryBrowserLogins("save");
  capabilities.setSessionRetention = vi.fn(capabilities.setSessionRetention);
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
      mode="detected"
    />,
  );
  const label = "Keep detected login across page changes";
  await screen.findByText("Save this login?");
  expect(screen.getByRole("switch", { name: label })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  fireEvent.click(screen.getByText(label));
  expect(capabilities.setSessionRetention).not.toHaveBeenCalled();
  expect(screen.getByRole("switch", { name: label })).not.toBeChecked();
  fireEvent.click(screen.getByText("Login detection", { exact: true }));
  await waitFor(() =>
    expect(screen.getByRole("switch", { name: label })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    ),
  );
  fireEvent.click(screen.getByText(label));
  await waitFor(() =>
    expect(capabilities.setSessionRetention).toHaveBeenCalledWith(true),
  );
  expect(screen.getByRole("switch", { name: label })).toBeChecked();
});

it("keeps a committed detection setting when the follow-up page read fails", async () => {
  const capabilities = galleryBrowserLogins("save");
  const originalRead = capabilities.read;
  capabilities.read = vi
    .fn()
    .mockImplementationOnce(originalRead)
    .mockRejectedValue(new Error("Active tab refresh failed"));
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
      mode="detected"
    />,
  );
  await screen.findByText("Save this login?");
  fireEvent.click(screen.getByText("Login detection", { exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Login detection is on, but this page could not be refreshed.",
  );
  expect(screen.getByRole("switch", { name: "Login detection" })).toBeChecked();
  expect(
    screen.queryByRole("button", { name: "Review new login" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("Could not enable login detection"),
  ).not.toBeInTheDocument();
});

it("does not restore a stale captured login when disabling detection and the replacement read fails", async () => {
  const capabilities = galleryBrowserLogins(
    "detection-stale-read-refresh-error",
  );
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
      mode="detected"
    />,
  );
  const detection = await screen.findByRole("switch", {
    name: "Login detection",
  });
  expect(detection).toBeChecked();

  fireEvent.click(screen.getByText("Login detection", { exact: true }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Login detection is off, but this page could not be refreshed.",
  );
  expect(detection).not.toBeChecked();
  expect(
    screen.queryByRole("button", { name: "Review new login" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("alex@example.com")).not.toBeInTheDocument();
});

it("shows detection as off when disabling commits before cleanup rejects", async () => {
  const capabilities = galleryBrowserLogins("session-redirect");
  const setDetection = capabilities.setDetection;
  capabilities.setDetection = vi.fn(async (next) => {
    await setDetection(next);
    throw new Error("Website cleanup failed");
  });
  capabilities.detectionEnabled = vi.fn(capabilities.detectionEnabled);
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
      mode="detected"
    />,
  );
  await screen.findByText("Save this login?");
  fireEvent.click(screen.getByText("Login detection", { exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Login detection is off, but LFSPM could not finish clearing detected logins or stopping detection on open websites.",
  );
  expect(
    screen.getByRole("switch", { name: "Login detection" }),
  ).not.toBeChecked();
  expect(
    screen.queryByRole("button", { name: "Review new login" }),
  ).not.toBeInTheDocument();
});

it("restores authoritative retention after a rejected change", async () => {
  const capabilities = galleryBrowserLogins("session-redirect");
  capabilities.setSessionRetention = vi
    .fn()
    .mockRejectedValue(new Error("Detected login cleanup failed"));
  capabilities.sessionRetentionEnabled = vi.fn(
    capabilities.sessionRetentionEnabled,
  );
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
      mode="detected"
    />,
  );
  const label = "Keep detected login across page changes";
  await screen.findByText("Save this login?");
  fireEvent.click(screen.getByText(label));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not change login retention.",
  );
  expect(screen.getByRole("switch", { name: label })).toBeChecked();
  expect(
    screen.getByRole("button", { name: "Review new login" }),
  ).toBeInTheDocument();
});

it("keeps retention retryable when the write and authoritative read fail", async () => {
  const capabilities = galleryBrowserLogins("retention-change-error");
  capabilities.setSessionRetention = vi.fn(capabilities.setSessionRetention);
  capabilities.sessionRetentionEnabled = vi.fn(
    capabilities.sessionRetentionEnabled,
  );
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
      mode="detected"
    />,
  );
  const label = "Keep detected login across page changes";
  const retention = await screen.findByRole("switch", { name: label });
  expect(retention).toBeChecked();

  fireEvent.click(screen.getByText(label));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not change login retention.",
  );
  expect(retention).toBeChecked();
  expect(retention).not.toHaveAttribute("aria-disabled", "true");
  fireEvent.click(screen.getByText(label));
  await waitFor(() =>
    expect(capabilities.setSessionRetention).toHaveBeenCalledTimes(2),
  );
});

it("clears authorization-lost settings without rereading captured credentials", async () => {
  const capabilities = galleryBrowserLogins("save");
  capabilities.read = vi.fn(capabilities.read);
  capabilities.detectionEnabled = vi.fn(capabilities.detectionEnabled);
  const authorizationError = new Error("session expired");
  authorizationError.name = "UnlockedVaultSessionExpiredError";
  capabilities.setDetection = vi.fn().mockRejectedValue(authorizationError);
  const onSessionLost = vi.fn();
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
      onSessionLost={onSessionLost}
      mode="detected"
    />,
  );
  await screen.findByText("Save this login?");
  fireEvent.click(screen.getByText("Login detection", { exact: true }));
  await waitFor(() => expect(onSessionLost).toHaveBeenCalledOnce());
  expect(capabilities.read).toHaveBeenCalledOnce();
  expect(capabilities.detectionEnabled).toHaveBeenCalledOnce();
  expect(screen.queryByText("Save this login?")).not.toBeInTheDocument();
});

it("clears the panel when authorization is lost during setting reconciliation", async () => {
  const capabilities = galleryBrowserLogins("save");
  const originalRead = capabilities.read;
  const authorizationError = new Error("session replaced");
  authorizationError.name = "UnlockedVaultSessionInvalidError";
  capabilities.read = vi
    .fn()
    .mockImplementationOnce(originalRead)
    .mockRejectedValue(authorizationError);
  capabilities.setDetection = vi
    .fn()
    .mockRejectedValue(new Error("Website cleanup failed"));
  const onSessionLost = vi.fn();
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={() => {}}
      onSessionLost={onSessionLost}
      mode="detected"
    />,
  );
  await screen.findByText("Save this login?");
  fireEvent.click(screen.getByText("Login detection", { exact: true }));
  await waitFor(() => expect(onSessionLost).toHaveBeenCalledOnce());
  expect(screen.queryByText("Save this login?")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("reviews the original website after a redirect without offering Fill for its captured password", async () => {
  const capabilities = galleryBrowserLogins("session-redirect");
  const onReview = vi.fn();
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={onReview}
      mode="detected"
    />,
  );
  await screen.findByText("Save this login?");
  expect(screen.getByText("example.com")).toBeInTheDocument();
  expect(screen.getByText("account.example.org")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Fill" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review new login" }));
  await waitFor(() =>
    expect(onReview).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/login",
        expiresAt: null,
      }),
      undefined,
    ),
  );
});

it("refuses a stale update choice when the saved login has changed since the review prompt", async () => {
  const capabilities = galleryBrowserLogins("update");
  const onReview = vi.fn();
  render(
    <BrowserLoginsPanel
      vaultId="vault"
      capabilities={capabilities}
      onReview={onReview}
      mode="detected"
    />,
  );
  await screen.findByRole("button", { name: "Review update" });
  const originalRead = capabilities.read;
  capabilities.read = async (vaultId) => ({
    ...(await originalRead(vaultId)),
    updateEntryIds: [],
  });
  fireEvent.click(screen.getByRole("button", { name: "Review update" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This saved login changed.",
  );
  expect(onReview).not.toHaveBeenCalled();
});
