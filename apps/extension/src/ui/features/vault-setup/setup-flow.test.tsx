import { galleryWorkspace } from "@/gallery/workspace-fixture";
import { gallerySync } from "@/gallery/sync-fixture";
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
  initialStep: "welcome" | "password" | "device" = "password",
) {
  return render(
    <OptionsView
      workspace={galleryWorkspace()}
      sync={gallerySync()}
      setup={setup}
      preference="dark"
      onThemeChange={() => {}}
      assessPassword={async () => ({ score: 4 })}
      initialStep={initialStep}
    />,
  );
}
describe("live setup UI", () => {
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
        await screen.findByLabelText("Vault password"),
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
    await user.click(
      await screen.findByRole("button", { name: "Create vault" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "I saved all 24 words" }),
    );
    await user.click(screen.getByRole("button", { name: "Check words" }));
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
    await user.click(screen.getByRole("combobox", { name: "Vault" }));
    await user.click(await screen.findByRole("option", { name: /Work vault/ }));
    await user.type(
      await screen.findByLabelText("Vault password"),
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
      await screen.findByRole("heading", { name: "Entries" }),
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
    setup.inspect = vi.fn().mockResolvedValue({ vault: null, vaults: [] });
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
