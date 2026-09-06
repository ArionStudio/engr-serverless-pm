import { gallerySetup } from "@/gallery/setup-fixture";
// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CheckPasswordStrengthUseCase } from "@lfspm/core";
import { PopupView } from "./popup/popup.view";
import { SetupWelcome } from "@/ui/features/vault-setup";
import { OptionsView } from "./options/options.view";
const strength = new CheckPasswordStrengthUseCase();
const assessPassword = (password: string) => strength.execute({ password });
afterEach(cleanup);

describe("first-launch screens", () => {
  it("selects setup cards by their label and keyboard without advancing until Continue", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onConnect = vi.fn();
    render(createElement(SetupWelcome, { onCreate, onConnect }));
    const create = screen.getByRole("radio", { name: "New vault" });
    const connect = screen.getByRole("radio", { name: "Existing vault" });
    expect(create).toBeChecked();
    await user.click(screen.getByText("Existing vault"));
    expect(connect).toBeChecked();
    expect(create).not.toBeChecked();
    expect(onConnect).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    expect(onConnect).toHaveBeenCalledTimes(1);
    connect.focus();
    await user.keyboard("{ArrowLeft}");
    expect(create).toBeChecked();
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByText(
        "A way to transfer the access request and approval between devices.",
      ),
    );
    expect(connect).toBeChecked();
  });

  it("prevents repeated handoffs and makes opening failures retryable", async () => {
    const user = userEvent.setup();
    let rejectOpen: (reason: Error) => void = () => {};
    const onOpenOptions = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectOpen = reject;
        }),
    );
    render(
      createElement(PopupView, {
        availability: "empty",
        onOpenOptions,
        onRetry: vi.fn(),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Set up vault" }));
    expect(
      screen.getByRole("button", { name: "Opening Options…" }),
    ).toBeDisabled();
    expect(onOpenOptions).toHaveBeenCalledTimes(1);
    rejectOpen(new Error("Denied"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t open Options",
    );
    expect(screen.getByRole("button", { name: "Set up vault" })).toBeEnabled();
  });

  it("validates confirmation, preserves drafts on Back, and clears them when leaving setup", async () => {
    const user = userEvent.setup();
    render(
      createElement(OptionsView, {
        setup: gallerySetup(),
        preference: "light",
        onThemeChange: vi.fn(),
        assessPassword,
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    const password = "orbit lantern velvet canyon river";
    await user.type(
      screen.getByLabelText("New password", { exact: true }),
      password,
    );
    await screen.findByText("Strong");
    await user.type(
      screen.getByLabelText("Confirm password", { exact: true }),
      "wrong",
    );
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(
        screen.getByLabelText("Confirm password", { exact: true }),
      ).toHaveFocus(),
    );
    await user.clear(
      screen.getByLabelText("Confirm password", { exact: true }),
    );
    await user.type(
      screen.getByLabelText("Confirm password", { exact: true }),
      password,
    );
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Device settings" }),
    ).toBeInTheDocument();
    const lockDuration = screen.getByLabelText("Lock duration on this device");
    expect(lockDuration).toHaveValue("600000");
    expect(
      Array.from(
        (lockDuration as HTMLSelectElement).options,
        (option) => option.value,
      ),
    ).toEqual(["60000", "300000", "600000", "1800000", "3600000"]);
    await user.selectOptions(lockDuration, "1800000");
    expect(lockDuration).toHaveValue("1800000");
    await user.click(screen.getByRole("button", { name: "Back to password" }));
    expect(screen.getByLabelText("New password", { exact: true })).toHaveValue(
      password,
    );
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("New password", { exact: true })).toHaveValue(
      "",
    );
    expect(
      screen.getByLabelText("Confirm password", { exact: true }),
    ).toHaveValue("");
  });

  it("does not route an existing vault into first-time creation", async () => {
    render(
      createElement(OptionsView, {
        setup: gallerySetup("existing"),
        preference: "light",
        onThemeChange: vi.fn(),
        assessPassword,
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Unlock vault" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "New vault" }),
    ).not.toBeInTheDocument();
  });
});
