// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordToolsPage } from "./password-tools-page.view";
import type { EntryTools } from "./password-tools.type";

afterEach(cleanup);

function capabilities(): EntryTools {
  return {
    assess: vi.fn(async () => ({ score: 4 as const })),
    generate: vi.fn(async () => ({ password: "River-Sky-84!Gallery" })),
    username: vi.fn(async () => ({ username: "river-pine-84" })),
  };
}

describe("Password tools", () => {
  it("generates through core capabilities and hands the concealed value to a new entry", async () => {
    const tools = capabilities();
    const onUse = vi.fn();
    render(<PasswordToolsPage tools={tools} onUse={onUse} />);
    expect(
      screen.queryByLabelText("Generated password"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate password" }));
    const field = await screen.findByLabelText("Generated password");
    expect(field).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(field).toHaveAttribute("type", "text");
    fireEvent.blur(window);
    expect(field).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Use in new entry" }));
    expect(onUse).toHaveBeenCalledWith({ password: "River-Sky-84!Gallery" });
    expect(
      screen.queryByLabelText("Generated password"),
    ).not.toBeInTheDocument();
  });

  it("drops late password results when switching to the username tool", async () => {
    const tools = capabilities();
    let finish!: (value: { password: string }) => void;
    tools.generate = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    render(<PasswordToolsPage tools={tools} onUse={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate password" }));
    fireEvent.click(screen.getByRole("tab", { name: "Username" }));
    finish({ password: "Late-Secret-84!Value" });
    fireEvent.click(screen.getByRole("button", { name: "Generate username" }));
    await screen.findByDisplayValue("river-pine-84");
    expect(
      screen.queryByDisplayValue("Late-Secret-84!Value"),
    ).not.toBeInTheDocument();
  });

  it("shows a retryable failure without retaining a previous value", async () => {
    const tools = capabilities();
    tools.generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValue({ password: "Next-River-84!Gallery" });
    render(<PasswordToolsPage tools={tools} onUse={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate password" }));
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Generate password" }),
      ).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate password" }));
    await screen.findByDisplayValue("Next-River-84!Gallery");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
