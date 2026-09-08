// @vitest-environment jsdom
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
it("fills only the selected login after a click and reports failure", async () => {
  const capabilities = galleryBrowserLogins();
  capabilities.fill = vi.fn().mockRejectedValue(new Error("The page changed."));
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
  await screen.findByText("The page changed.");
  expect(capabilities.fill).toHaveBeenCalledWith(
    "vault",
    "entry-1",
    expect.objectContaining({
      url: "https://example.com/login",
      documentToken: "gallery",
    }),
  );
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
