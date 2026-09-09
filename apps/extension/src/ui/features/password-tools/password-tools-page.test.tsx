// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordToolsPage } from "./password-tools-page.view";
import type { EntryTools } from "./password-tools.type";

afterEach(cleanup);

function capabilities(): EntryTools {
  return {
    assess: vi.fn(async () => ({ score: 4 as const })),
    generate: vi.fn(async () => ({ password: "River-Sky-84!Gallery" })),
    username: vi.fn(async () => ({ username: "river-pine-84" })),
    copy: vi.fn(async () => {}),
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
    expect(await screen.findByText("Concealed")).toBeVisible();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Strong");
    expect(
      screen.queryByDisplayValue("River-Sky-84!Gallery"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    const field = screen.getByDisplayValue("River-Sky-84!Gallery");
    expect(field).toHaveAttribute("type", "text");
    fireEvent.blur(window);
    expect(
      screen.queryByDisplayValue("River-Sky-84!Gallery"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByText(
      "Copied. The clipboard will clear after 30 seconds.",
    );
    expect(tools.copy).toHaveBeenCalledWith("River-Sky-84!Gallery");
    fireEvent.click(screen.getByRole("button", { name: "Use in new entry" }));
    expect(onUse).toHaveBeenCalledWith({ password: "River-Sky-84!Gallery" });
    expect(
      screen.queryByLabelText("Generated password"),
    ).not.toBeInTheDocument();
  });

  it("allows ordinary numeric editing, clamps on commit and explains an impossible character selection", async () => {
    const tools = capabilities();
    const user = userEvent.setup();
    render(<PasswordToolsPage tools={tools} onUse={() => {}} />);

    const length = screen.getByRole("spinbutton", {
      name: "Password length",
    });
    await user.clear(length);
    await user.type(length, "24");
    expect(length).toHaveValue(24);
    await user.tab();
    expect(length).toHaveValue(24);
    await user.clear(length);
    await user.type(length, "400");
    await user.tab();
    expect(
      screen.getByRole("spinbutton", { name: "Password length" }),
    ).toHaveValue(128);

    for (const label of [
      "Uppercase letters",
      "Lowercase letters",
      "Numbers",
      "Special characters",
    ])
      await user.click(screen.getByText(label));

    expect(
      screen.getByText("Select at least one character group."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Generate password" }),
    ).toBeDisabled();
    expect(tools.generate).not.toHaveBeenCalled();
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
    expect(screen.getByRole("status")).toHaveTextContent(
      "Generating password",
    );
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
    expect(
      await screen.findByRole("region", { name: "Generated value" }),
    ).toBeVisible();
    expect(
      screen.queryByDisplayValue("Next-River-84!Gallery"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByDisplayValue("Next-River-84!Gallery")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears a generated password when copying discovers that the vault session ended", async () => {
    const tools = capabilities();
    const onSessionLost = vi.fn();
    const authorizationError = new Error("Session ended");
    authorizationError.name = "ActiveVaultMustBeUnlockedError";
    tools.copy = vi.fn(async () => {
      throw authorizationError;
    });
    render(
      <PasswordToolsPage
        tools={tools}
        onUse={() => {}}
        onSessionLost={onSessionLost}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate password" }));
    await screen.findByRole("region", { name: "Generated value" });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(onSessionLost).toHaveBeenCalledOnce());
    expect(
      screen.queryByLabelText("Generated password"),
    ).not.toBeInTheDocument();
  });

  it("keeps the generated result active until secure copying finishes", async () => {
    const tools = capabilities();
    let finishCopy!: () => void;
    tools.copy = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCopy = resolve;
        }),
    );
    const onPendingChange = vi.fn();
    render(
      <PasswordToolsPage
        tools={tools}
        onUse={() => {}}
        onPendingChange={onPendingChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate password" }));
    await screen.findByRole("region", { name: "Generated value" });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(screen.getByRole("button", { name: /Copying…/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Generate password" }),
    ).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Username" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Use in new entry" }),
    ).toBeDisabled();
    expect(onPendingChange).toHaveBeenLastCalledWith(true);

    await act(async () => finishCopy());
    expect(await screen.findByRole("button", { name: "Copied" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Generate password" }),
    ).toBeEnabled();
    expect(screen.getByRole("tab", { name: "Username" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });
});
