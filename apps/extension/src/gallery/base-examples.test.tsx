// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { BaseExamples } from "./base-examples.view";

afterEach(cleanup);

describe("generated base controls in the gallery", () => {
  it("opens confirmation with safe focus and restores focus after cancellation", async () => {
    const user = userEvent.setup();
    render(createElement(BaseExamples));
    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    await user.click(trigger);
    const dialog = await screen.findByRole("alertdialog", {
      name: "Reset example actions?",
    });
    const cancel = within(dialog).getByRole("button", {
      name: "Keep examples",
    });
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.click(cancel);
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps checkbox labels and keyboard tabs connected to generated controls", async () => {
    const user = userEvent.setup();
    render(createElement(BaseExamples));
    const checkbox = screen.getByRole("checkbox", { name: "Include numbers" });
    expect(checkbox).toBeChecked();
    await user.click(screen.getByText("Include numbers"));
    expect(checkbox).not.toBeChecked();
    const firstTab = screen.getByRole("tab", { name: "Password" });
    firstTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Username" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("tabpanel", { name: "Username" }),
    ).toHaveTextContent("Username controls go here.");
  });
});
