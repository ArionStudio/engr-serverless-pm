import { galleryDevices } from "@/gallery/device-fixture";
import { galleryVaultSettings } from "@/gallery/settings-fixture";
import { galleryWorkspace } from "@/gallery/workspace-fixture";
import { gallerySync } from "@/gallery/sync-fixture";
import { galleryTagManagement } from "@/gallery/tag-management-fixture";
import { galleryFolderManagement } from "@/gallery/folder-management-fixture";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { OptionsView } from "@/ui/entrypoints/options/options.view";
import {
  gallerySetup,
  setupRecovery,
  setupVault,
} from "@/gallery/setup-fixture";
import type { SetupCapabilities } from "./setup.type";
import { useVaultSetup } from "./use-vault-setup";
afterEach(cleanup);
function mount(
  setup: SetupCapabilities,
  initialStep: "welcome" | "password" | "device" = "password",
) {
  return render(
    <OptionsView
      devices={galleryDevices()}
      vaultSettings={galleryVaultSettings("ready", (_name, duration) => {
        void setup.saveDuration("gallery-vault", duration);
      })}
      workspace={galleryWorkspace()}
      tagManagement={galleryTagManagement()}
      folderManagement={galleryFolderManagement()}
      sync={gallerySync()}
      setup={setup}
      preference="dark"
      onThemeChange={() => {}}
      assessPassword={async () => ({ score: 4 })}
      initialStep={initialStep}
    />,
  );
}
async function createFromDevice(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Continue to organization" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Organize your vault" }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Continue to recovery" }),
  );
}
describe("live setup UI", () => {
  it("keeps a pending setup submission serialized across page suspension", async () => {
    const setup = gallerySetup();
    let invalidate: Parameters<SetupCapabilities["subscribe"]>[0] = () => {};
    let finish: (value: typeof setupRecovery) => void = () => {};
    setup.subscribe = (listener) => {
      invalidate = listener;
      return () => {};
    };
    const create = vi.fn(
      () =>
        new Promise<typeof setupRecovery>((resolve) => {
          finish = resolve;
        }),
    );
    setup.create = create;
    const { result } = renderHook(() => useVaultSetup(setup));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const input = {
      password: "synthetic strong password",
      deviceName: "Browser",
      duration: 600_000,
    };
    await act(async () => {
      void result.current.create(input);
    });
    await act(async () => invalidate("pagehide"));
    expect(result.current.loading).toBe(true);
    await act(async () => invalidate());
    await act(async () => {
      void result.current.create(input);
    });
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => finish(setupRecovery));
    expect(result.current.recovery).toBeUndefined();
    expect(result.current.pending).toBe(false);
    await act(async () => {
      void result.current.create(input);
    });
    expect(create).toHaveBeenCalledTimes(2);
    await act(async () => finish(setupRecovery));
    expect(result.current.recovery).toEqual(setupRecovery);
  });
  it("returns to setup when inspection discovers the last vault was deleted", async () => {
    const setup = gallerySetup("existing");
    let invalidate = () => {};
    setup.subscribe = (callback) => {
      invalidate = callback;
      return () => {};
    };
    mount(setup, "welcome");
    await screen.findByRole("heading", { name: "Unlock vault" });
    setup.inspect = async () => ({ vault: null, vaults: [] });
    await act(async () => {
      invalidate();
    });
    expect(
      await screen.findByRole("heading", { name: "Set up vault" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Unlock vault" }),
    ).not.toBeInTheDocument();
  });
  it("retries the authoritative setup inspection after a read failure", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup();
    setup.inspect = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue({ vault: null, vaults: [] });
    mount(setup, "welcome");
    await screen.findByRole("heading", { name: "Couldn’t check local vaults" });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Set up vault" }),
    ).toBeVisible();
  });

  it.each(["resolve", "reject"])(
    "discards a stale unlock %s after session invalidation",
    async (outcome) => {
      const user = userEvent.setup();
      const setup = gallerySetup();
      const locked = { ...setupVault, unlocked: false };
      setup.inspect = async () => ({ vault: locked, vaults: [locked] });
      let invalidate = () => {};
      setup.subscribe = (callback) => {
        invalidate = callback;
        return () => {};
      };
      let finish: (value: typeof setupVault) => void = () => {};
      let fail: (error: Error) => void = () => {};
      setup.unlock = () =>
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        });
      mount(setup);
      await user.type(
        await screen.findByLabelText("Password for this browser"),
        "private password",
      );
      await user.click(screen.getByRole("button", { name: "Unlock" }));
      await act(async () => {
        invalidate();
      });
      await act(async () => {
        if (outcome === "resolve") finish(setupVault);
        else fail(new Error("Old unlock failed"));
      });
      expect(
        screen.getByRole("heading", { name: "Unlock vault" }),
      ).toBeVisible();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Finish saving recovery words" }),
      ).not.toBeInTheDocument();
    },
  );
  it("keeps errors from a current lock operation visible", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup();
    setup.inspect = async () => ({
      vault: { ...setupVault, complete: true },
      vaults: [setupVault],
    });
    setup.lock = async () => {
      throw new Error("Lock failed");
    };
    mount(setup);
    await user.click(await screen.findByRole("button", { name: "Lock vault" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not lock the vault",
    );
  });
  it("discards a stale verification mismatch after invalidation", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup();
    let invalidate = () => {};
    let finish: (value: boolean) => void = () => {};
    setup.subscribe = (callback) => {
      invalidate = callback;
      return () => {};
    };
    setup.verify = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    mount(setup, "device");
    await createFromDevice(user);
    await user.click(
      await screen.findByRole("button", { name: "I saved all 24 words" }),
    );
    await user.click(screen.getByRole("button", { name: "Check words" }));
    expect(
      screen.getByRole("button", { name: "Review recovery words" }),
    ).toBeDisabled();
    setup.inspect = async () => ({
      vault: { ...setupVault, unlocked: false },
      vaults: [setupVault],
    });
    await act(async () => {
      invalidate();
    });
    await act(async () => {
      finish(false);
    });
    expect(
      await screen.findByRole("heading", { name: "Unlock vault" }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("requires a vault selection and retains it after unlocking and locking", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup("multiple");
    const unlock = vi.spyOn(setup, "unlock");
    mount(setup);
    expect(
      await screen.findByRole("heading", { name: "Choose a vault" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show options" }));
    await user.click(await screen.findByRole("option", { name: /Work vault/ }));
    await user.type(
      await screen.findByLabelText("Password for this browser"),
      "private password",
    );
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(unlock).toHaveBeenCalledWith("work-vault", "private password");
    await user.click(await screen.findByRole("button", { name: "Lock vault" }));
    expect(await screen.findByRole("combobox", { name: "Vault" })).toHaveValue(
      "Work vault · This browser",
    );
  });
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
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Continue to device settings" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Continue to device settings" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Continue to organization" }),
    );
    await screen.findByRole("heading", { name: "Organize your vault" });
    await user.click(screen.getByRole("button", { name: /2\. Device/ }));
    expect(
      screen.getByRole("heading", { name: "Device settings" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Continue to organization" }),
    );
    await user.dblClick(
      screen.getByRole("button", { name: "Continue to recovery" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Save recovery words" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Download: Download text file" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Print: Print or save as PDF" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy: Copy recovery words" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: /3\. OrganizationComplete/,
      }),
    ).toBeVisible();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].organization).toMatchObject({
      folders: [{ name: "Work" }, { name: "Personal" }, { name: "Finance" }],
      tags: [{ name: "Expiring" }, { name: "MFA" }, { name: "Shared" }],
    });
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
      await screen.findByRole("heading", { name: "Entries" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Word 3")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Lock duration on this device"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(
      screen.getByRole("button", { name: "Edit device settings" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Lock duration on this device"),
      "1800000",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(
      "Device settings saved. The lock duration applies from the next unlock.",
    );
    await user.click(screen.getByRole("button", { name: "Entries" }));
    expect(
      screen.queryByLabelText("Lock duration on this device"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(
      screen.getByRole("button", { name: "Edit device settings" }),
    );
    expect(screen.getByLabelText("Lock duration on this device")).toHaveValue(
      "1800000",
    );
  });
  it("clears visible words and answers when the session is invalidated", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup();
    let invalidate = () => {};
    setup.inspect = vi.fn().mockResolvedValue({ vault: null, vaults: [] });
    setup.subscribe = (callback) => {
      invalidate = callback;
      return () => {};
    };
    setup.create = async () => setupRecovery;
    mount(setup, "device");
    await createFromDevice(user);
    await user.click(
      await screen.findByRole("button", { name: "Reveal recovery words" }),
    );
    setup.inspect = vi.fn().mockResolvedValue({
      vault: { ...setupVault, unlocked: false },
      vaults: [setupVault],
    });
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
    await createFromDevice(user);
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

describe("forgotten vault password", () => {
  const phrase = Array(24).fill("abandon").join(" ");
  async function enter(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole("button", { name: "Forgot password?" }),
    );
    await user.type(
      screen.getByLabelText("Recovery phrase", { exact: true }),
      phrase.toUpperCase(),
    );
    await user.type(
      screen.getByLabelText("New password", { exact: true }),
      "A new private password",
    );
    await user.type(
      screen.getByLabelText("Confirm new password", { exact: true }),
      "A new private password",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Set new password" }),
      ).toBeEnabled(),
    );
  }
  it("recovers the selected vault and requires replacement-word verification before entries", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup("existing");
    const recover = vi.spyOn(setup, "recover");
    const create = vi.spyOn(setup, "create");
    mount(setup);
    await enter(user);
    const input = screen.getByLabelText("Recovery phrase", { exact: true });
    await user.clear(input);
    await user.paste(
      phrase
        .split(" ")
        .map((word, index) => `${index + 1}. ${word.toUpperCase()}`)
        .join("\n"),
    );
    expect(input).toHaveValue(phrase);
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    expect(
      await screen.findByRole("heading", {
        name: "Save replacement recovery words",
      }),
    ).toBeVisible();
    expect(recover).toHaveBeenCalledWith(
      setupVault.vaultId,
      phrase.split(" "),
      "A new private password",
    );
    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Recovery phrase")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "I saved all 24 words" }),
    );
    for (const position of setupRecovery.positions)
      await user.type(
        screen.getByLabelText(`Word ${position}`),
        setupRecovery.words[position - 1],
      );
    await user.click(screen.getByRole("button", { name: "Check words" }));
    expect(
      await screen.findByRole("heading", { name: "Entries" }),
    ).toBeVisible();
  });
  it("clears a recovery draft when a passive inspection cannot verify local vault state", async () => {
    const setup = gallerySetup("existing");
    let notify: (clearDraft?: boolean) => void = () => {};
    setup.subscribe = (listener) => {
      notify = listener;
      return () => {};
    };
    mount(setup);
    fireEvent.click(
      await screen.findByRole("button", { name: "Forgot password?" }),
    );
    fireEvent.change(
      screen.getByLabelText("Recovery phrase", { exact: true }),
      {
        target: { value: "private recovery draft" },
      },
    );
    setup.inspect = async () => {
      throw new Error("Local data unavailable");
    };
    await act(async () => notify(false));
    expect(
      await screen.findByRole("heading", {
        name: "Couldn’t check local vaults",
      }),
    ).toBeVisible();
    expect(
      screen.queryByDisplayValue("private recovery draft"),
    ).not.toBeInTheDocument();
  });
  it("requires all words and matching passwords before calling recovery", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup("existing");
    const recover = vi.spyOn(setup, "recover");
    mount(setup);
    await user.click(
      await screen.findByRole("button", { name: "Forgot password?" }),
    );
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    expect(
      screen.getByText(
        "Enter all 24 recovery words in order. Numbered lists must run from 1 to 24.",
      ),
    ).toBeVisible();
    fireEvent.change(
      screen.getByLabelText("Recovery phrase", { exact: true }),
      { target: { value: phrase } },
    );
    fireEvent.change(screen.getByLabelText("New password", { exact: true }), {
      target: { value: "A new private password" },
    });
    fireEvent.change(
      screen.getByLabelText("Confirm new password", { exact: true }),
      { target: { value: "a different password" } },
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Set new password" }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    expect(screen.getByText("The passwords don’t match.")).toBeVisible();
    expect(recover).not.toHaveBeenCalled();
  });
  it("retains rejected words for correction and clears secrets when cancelled", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup("existing");
    setup.recover = vi.fn().mockRejectedValue(new Error("Invalid words"));
    mount(setup);
    await enter(user);
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Check all 24 words");
    expect(alert).toHaveFocus();
    expect(
      screen.getByLabelText("Recovery phrase", { exact: true }),
    ).toHaveValue(phrase.toUpperCase());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(
      screen.getByLabelText("Recovery phrase", { exact: true }),
    ).toHaveValue("");
    expect(screen.getByLabelText("New password", { exact: true })).toHaveValue(
      "",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("clears the draft on invalidation and ignores a late recovery result", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup("existing");
    let invalidate = () => {};
    setup.subscribe = (callback) => {
      invalidate = callback;
      return () => {};
    };
    let finish: (value: typeof setupRecovery) => void = () => {};
    setup.recover = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    mount(setup);
    await enter(user);
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    expect(
      screen.getByRole("button", { name: /Setting new password…/ }),
    ).toBeDisabled();
    expect(
      screen.getByLabelText("Recovery phrase", { exact: true }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => {
      invalidate();
      finish(setupRecovery);
    });
    expect(
      await screen.findByRole("heading", { name: "Unlock vault" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(
      screen.getByLabelText("Recovery phrase", { exact: true }),
    ).toHaveValue("");
    expect(screen.getByLabelText("New password", { exact: true })).toHaveValue(
      "",
    );
  });
  it("returns to unlock without the old recovery draft after activation fails following a password change", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup("existing");
    setup.recover = async () => {
      const vault = { ...setupVault, unlocked: false, complete: false };
      setup.inspect = async () => ({ vault, vaults: [vault] });
      const error = new Error("Activation failed after credential rotation");
      error.name = "PasswordRecoveryCompletionError";
      throw error;
    };
    mount(setup);
    await enter(user);
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    expect(
      await screen.findByRole("heading", { name: "Unlock vault" }),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your password has changed. Unlock with your new password",
    );
    expect(screen.queryByLabelText("Recovery phrase")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Password for this browser", { exact: true }),
    ).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(
      screen.getByLabelText("Recovery phrase", { exact: true }),
    ).toHaveValue("");
    expect(screen.getByLabelText("New password", { exact: true })).toHaveValue(
      "",
    );
  });
});
