// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { VaultSettingsView } from "./vault-settings.view";
import type { VaultSettingsCapabilities } from "./settings.type";

const vault = {
  vaultId: "vault",
  name: "Private vault",
  deviceName: "Laptop",
  duration: 600000,
  complete: true,
  unlocked: true,
};
afterEach(cleanup);
function setup(
  onSessionLost = vi.fn(),
  generatePassword = async () => ({
    password: "Generated-river-8!Pine-sky",
  }),
) {
  const capabilities: VaultSettingsCapabilities = {
    inspectAuthorization: vi.fn(async () => {}),
    changePassword: vi.fn(async () => {}),
    saveDevice: vi.fn(async () => {}),
    removeLocalVault: vi.fn(async () => {}),
  };
  const onReplaceRecovery = vi.fn();
  const onDeleted = vi.fn();
  render(
    <VaultSettingsView
      vault={vault}
      capabilities={capabilities}
      assessPassword={async () => ({ score: 4 })}
      generatePassword={generatePassword}
      onReplaceRecovery={onReplaceRecovery}
      onDeleted={onDeleted}
      onSaved={vi.fn()}
      onSessionLost={onSessionLost}
    />,
  );
  return {
    capabilities,
    onReplaceRecovery,
    onDeleted,
    onSessionLost,
    user: userEvent.setup(),
  };
}
describe("vault settings", () => {
  it("preserves the current password while generation is pending", async () => {
    let finishGeneration: (value: { password: string }) => void = () => {};
    const { user } = setup(
      vi.fn(),
      () =>
        new Promise((resolve) => {
          finishGeneration = resolve;
        }),
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));
    const currentPassword = screen.getByLabelText("Current password", {
      exact: true,
    });
    await user.type(currentPassword, "current password");
    await user.click(
      screen.getByRole("button", { name: "Generate strong password" }),
    );

    expect(currentPassword).toBeDisabled();
    await user.type(currentPassword, " overwritten");
    expect(currentPassword).toHaveValue("current password");
    await act(async () =>
      finishGeneration({ password: "Generated-river-8!Pine-sky" }),
    );
    await waitFor(() => expect(currentPassword).toBeEnabled());
    expect(currentPassword).toHaveValue("current password");
  });
  it("hides empty strength feedback and requires current password plus matching confirmation", async () => {
    const { user, capabilities } = setup();
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New password", { exact: true }), {
      target: { value: "new long unique password" },
    });
    await screen.findByText("Strong", { exact: true });
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(capabilities.changePassword).not.toHaveBeenCalled();
    fireEvent.change(
      screen.getByLabelText("Current password", { exact: true }),
      { target: { value: "current password" } },
    );
    fireEvent.change(
      screen.getByLabelText("Confirm new password", { exact: true }),
      { target: { value: "new long unique password" } },
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await screen.findByText("Password changed for this browser.");
    expect(capabilities.changePassword).toHaveBeenCalledWith(
      "vault",
      "current password",
      "new long unique password",
    );
    expect(
      screen.queryByLabelText("Current password", { exact: true }),
    ).not.toBeInTheDocument();
  });
  it("requires the deletion acknowledgment and preserves the vault when cancelled", async () => {
    const { user, capabilities, onDeleted } = setup();
    await user.click(
      screen.getByRole("button", { name: "Remove local vault" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    const buttons = screen.getAllByRole("button", {
      name: "Remove local vault",
    });
    const confirm = buttons.find((button) => dialog.contains(button));
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(confirm).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(capabilities.removeLocalVault).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
  it("starts replacement only after acknowledging the need to save new words", async () => {
    const { user, onReplaceRecovery } = setup();
    await user.click(
      screen.getByRole("button", { name: "Replace recovery words" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    const confirm = screen
      .getAllByRole("button", { name: "Replace recovery words" })
      .find((button) => dialog.contains(button));
    expect(confirm).toBeDisabled();
    await user.click(
      screen.getByText(
        "I can save a private copy of the replacement words now.",
      ),
    );
    expect(confirm).toBeEnabled();
    if (confirm) await user.click(confirm);
    await waitFor(() => expect(onReplaceRecovery).toHaveBeenCalledOnce());
  });
  it("keeps password input after an ordinary rejected password", async () => {
    const { user, capabilities, onSessionLost } = setup();
    vi.mocked(capabilities.changePassword).mockRejectedValue(
      new Error("wrong password"),
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));
    fireEvent.change(
      screen.getByLabelText("Current password", { exact: true }),
      {
        target: { value: "incorrect private password" },
      },
    );
    fireEvent.change(screen.getByLabelText("New password", { exact: true }), {
      target: { value: "new long unique password" },
    });
    fireEvent.change(
      screen.getByLabelText("Confirm new password", { exact: true }),
      {
        target: { value: "new long unique password" },
      },
    );
    await screen.findByText("Strong", { exact: true });
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await screen.findByText(/Could not change the password/);
    expect(
      screen.getByLabelText("Current password", { exact: true }),
    ).toHaveValue("incorrect private password");
    expect(capabilities.inspectAuthorization).toHaveBeenCalledWith("vault");
    expect(onSessionLost).not.toHaveBeenCalled();
  });
  it.each(["known session error", "generic error"])(
    "clears password input and closes editing after authorization loss from a %s",
    async (kind) => {
      const { user, capabilities, onSessionLost } = setup();
      const failure = new Error("expired");
      if (kind === "known session error")
        failure.name = "UnlockedVaultSessionExpiredError";
      else
        vi.mocked(capabilities.inspectAuthorization).mockRejectedValue(
          new Error("locked"),
        );
      vi.mocked(capabilities.changePassword).mockRejectedValue(failure);
      await user.click(screen.getByRole("button", { name: "Change password" }));
      fireEvent.change(
        screen.getByLabelText("Current password", { exact: true }),
        {
          target: { value: "private password" },
        },
      );
      fireEvent.change(screen.getByLabelText("New password", { exact: true }), {
        target: { value: "new long unique password" },
      });
      fireEvent.change(
        screen.getByLabelText("Confirm new password", { exact: true }),
        {
          target: { value: "new long unique password" },
        },
      );
      await screen.findByText("Strong", { exact: true });
      await user.click(screen.getByRole("button", { name: "Change password" }));
      await waitFor(() => expect(onSessionLost).toHaveBeenCalledOnce());
      if (kind === "known session error")
        expect(capabilities.inspectAuthorization).not.toHaveBeenCalled();
      else
        expect(capabilities.inspectAuthorization).toHaveBeenCalledWith("vault");
      expect(
        screen.queryByLabelText("Current password", { exact: true }),
      ).toBeNull();
    },
  );
});
