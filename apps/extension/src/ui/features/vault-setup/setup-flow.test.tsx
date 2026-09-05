// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { OptionsView } from "@/ui/entrypoints/options/options.view";
import {
  gallerySetup,
  setupRecovery,
  setupVault,
} from "@/gallery/setup-fixture";
import type { SetupCapabilities } from "./setup.type";
afterEach(cleanup);
function mount(
  setup: SetupCapabilities,
  initialStep: "password" | "device" = "password",
) {
  return render(
    <OptionsView
      setup={setup}
      preference="dark"
      onThemeChange={() => {}}
      availability="empty"
      onRetry={() => {}}
      assessPassword={async () => ({ score: 4 })}
      initialStep={initialStep}
    />,
  );
}
describe("live setup UI", () => {
  it("creates once, conceals words, retains the challenge after errors, and finishes only after verification", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup();
    const create = vi.spyOn(setup, "create");
    mount(setup);
    await user.type(
      await screen.findByLabelText("New password", { exact: true }),
      "A-long-private-password",
    );
    await user.type(
      screen.getByLabelText("Confirm password", { exact: true }),
      "A-long-private-password",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.dblClick(
      await screen.findByRole("button", { name: "Create vault" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Save recovery words" }),
    ).toBeVisible();
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("demo-01", { exact: true }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Reveal recovery words" }),
    );
    expect(screen.getByText("demo-01", { exact: true })).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "I saved all 24 words" }),
    );
    expect(
      screen.queryByText("demo-01", { exact: true }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check words" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
    for (const position of setupRecovery.positions)
      await user.type(
        screen.getByLabelText(`Word ${position}`),
        setupRecovery.words[position - 1],
      );
    await user.click(screen.getByRole("button", { name: "Check words" }));
    expect(
      await screen.findByRole("heading", { name: "Vault ready" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Word 3")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Lock duration on this device"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.selectOptions(
      screen.getByLabelText("Lock duration on this device"),
      "1800000",
    );
    await user.click(screen.getByRole("button", { name: "Save lock setting" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save lock setting" }),
      ).toBeDisabled(),
    );
    await user.click(screen.getByRole("button", { name: "Back to vault" }));
    expect(
      screen.queryByLabelText("Lock duration on this device"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Lock duration on this device")).toHaveValue(
      "1800000",
    );
  });
  it("clears visible words and answers when the session is invalidated", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup();
    let invalidate = () => {};
    setup.inspect = vi.fn().mockResolvedValue(null);
    setup.subscribe = (callback) => {
      invalidate = callback;
      return () => {};
    };
    setup.create = async () => setupRecovery;
    mount(setup, "device");
    await user.click(
      await screen.findByRole("button", { name: "Create vault" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Reveal recovery words" }),
    );
    setup.inspect = vi
      .fn()
      .mockResolvedValue({ ...setupVault, unlocked: false });
    await act(async () => invalidate());
    expect(
      await screen.findByRole("heading", { name: "Unlock vault" }),
    ).toBeVisible();
    expect(
      screen.queryByText("demo-01", { exact: true }),
    ).not.toBeInTheDocument();
  });
  it("does not redisplay recovery from a stale creation result after invalidation", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup();
    let invalidate = () => {};
    let finish: (value: typeof setupRecovery) => void = () => {};
    setup.subscribe = (callback) => {
      invalidate = callback;
      return () => {};
    };
    setup.create = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    mount(setup, "device");
    await user.click(
      await screen.findByRole("button", { name: "Create vault" }),
    );
    await act(async () => {
      invalidate();
      finish(setupRecovery);
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Save recovery words" }),
      ).not.toBeInTheDocument(),
    );
  });
});
