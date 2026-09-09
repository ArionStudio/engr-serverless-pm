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
import { OptionsView } from "./options.view";
import { gallerySetup, setupVault } from "@/gallery/setup-fixture";
import { galleryWorkspace } from "@/gallery/workspace-fixture";
import { gallerySync } from "@/gallery/sync-fixture";
import { galleryDevices } from "@/gallery/device-fixture";
import { galleryVaultSettings } from "@/gallery/settings-fixture";
import { galleryTagManagement } from "@/gallery/tag-management-fixture";
import { galleryFolderManagement } from "@/gallery/folder-management-fixture";
import type { SetupInspection } from "@/ui/features/vault-setup/setup.type";
import { emptyEntryDraft } from "@/ui/features/entries/entry-draft";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Options navigation and session refresh", () => {
  it("keeps enrollment credentials and the current step while a focus refresh is pending", async () => {
    const setup = gallerySetup();
    const initial: SetupInspection = { vault: null, vaults: [] };
    setup.inspect = async () => initial;
    let notify: (clearDraft?: boolean) => void = () => {};
    setup.subscribe = (callback) => {
      notify = callback;
      return () => {};
    };
    render(
      <OptionsView
        preference="dark"
        onThemeChange={() => {}}
        assessPassword={async () => ({ score: 4 })}
        initialStep="connect"
        setup={setup}
        workspace={galleryWorkspace()}
        sync={gallerySync()}
        devices={galleryDevices()}
        vaultSettings={galleryVaultSettings()}
        tagManagement={galleryTagManagement()}
        folderManagement={galleryFolderManagement()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "I already have an approval" }),
    );
    fireEvent.change(screen.getByLabelText("Password for this browser"), {
      target: { value: "fixture-password" },
    });
    fireEvent.change(screen.getByLabelText("Device approval"), {
      target: { value: "fixture-approval" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify approval" }));
    const secret = await screen.findByLabelText("Secret access key");
    fireEvent.change(secret, { target: { value: "fixture-unsaved-secret" } });
    let finish: (value: SetupInspection) => void = () => {};
    setup.inspect = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    await act(async () => notify(false));
    expect(screen.getByLabelText("Secret access key")).toBe(secret);
    expect(secret).toHaveValue("fixture-unsaved-secret");
    expect(screen.getByLabelText("Device approval")).toHaveValue(
      "fixture-approval",
    );
    await act(async () => finish(initial));
    expect(screen.getByLabelText("Secret access key")).toBe(secret);
    expect(secret).toHaveValue("fixture-unsaved-secret");
    await act(async () => notify(true));
    expect(screen.queryByLabelText("Secret access key")).toBeNull();
    await act(async () => finish(initial));
    expect(
      screen.getByRole("heading", { name: "Connect a vault" }),
    ).toBeVisible();
  });

  it("starts at the popup shortcut destination", async () => {
    const setup = gallerySetup();
    const unlocked = { ...setupVault, complete: true, unlocked: true };
    setup.inspect = async () => ({ vault: unlocked, vaults: [unlocked] });
    const props = {
      preference: "dark" as const,
      onThemeChange: () => {},
      assessPassword: async () => ({ score: 4 as const }),
      setup,
      workspace: galleryWorkspace(),
      sync: gallerySync(),
      devices: galleryDevices(),
      vaultSettings: galleryVaultSettings(),
      tagManagement: galleryTagManagement(),
      folderManagement: galleryFolderManagement(),
    };
    const tools = render(<OptionsView {...props} initialDestination="tools" />);
    expect(
      await screen.findByRole("heading", { name: "Password tools" }),
    ).toBeVisible();
    tools.rerender(
      <OptionsView
        {...props}
        initialDestination="entries"
        initialEntryDraft={emptyEntryDraft}
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Add entry" }),
    ).toBeVisible();
  });
  it("reapplies the same popup shortcut after internal navigation", async () => {
    const setup = gallerySetup();
    const unlocked = { ...setupVault, complete: true, unlocked: true };
    setup.inspect = async () => ({ vault: unlocked, vaults: [unlocked] });
    const props = {
      preference: "dark" as const,
      onThemeChange: () => {},
      assessPassword: async () => ({ score: 4 as const }),
      setup,
      workspace: galleryWorkspace(),
      sync: gallerySync(),
      devices: galleryDevices(),
      vaultSettings: galleryVaultSettings(),
      tagManagement: galleryTagManagement(),
      folderManagement: galleryFolderManagement(),
      initialDestination: "sync" as const,
    };
    const user = userEvent.setup();
    const view = render(<OptionsView {...props} routeRequestId={0} />);

    expect(await screen.findByRole("heading", { name: "Sync" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Entries" }));
    expect(
      await screen.findByRole("heading", { name: "Entries" }),
    ).toBeVisible();

    view.rerender(<OptionsView {...props} routeRequestId={1} />);
    expect(await screen.findByRole("heading", { name: "Sync" })).toBeVisible();
  });
  it("opens the selected locked vault directly in password recovery", async () => {
    const setup = gallerySetup("existing");
    let notify: (clearDraft?: boolean) => void = () => {};
    setup.subscribe = (callback) => {
      notify = callback;
      return () => {};
    };
    const onExitRecovery = vi.fn();
    const user = userEvent.setup();
    render(
      <OptionsView
        preference="dark"
        onThemeChange={() => {}}
        assessPassword={async () => ({ score: 4 })}
        setup={setup}
        workspace={galleryWorkspace()}
        sync={gallerySync()}
        devices={galleryDevices()}
        vaultSettings={galleryVaultSettings()}
        tagManagement={galleryTagManagement()}
        folderManagement={galleryFolderManagement()}
        initialRecovery
        onExitRecovery={onExitRecovery}
      />,
    );

    expect(
      await screen.findByLabelText("Recovery phrase", { exact: true }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Unlock vault" }),
    ).not.toBeInTheDocument();

    const phrase = screen.getByLabelText("Recovery phrase", { exact: true });
    fireEvent.change(phrase, {
      target: { value: "unfinished recovery phrase" },
    });
    const newPassword = screen.getByLabelText("New password", { exact: true });
    fireEvent.change(newPassword, {
      target: { value: "unsaved recovery password" },
    });
    await act(async () => notify(false));
    expect(screen.getByLabelText("Recovery phrase", { exact: true })).toBe(
      phrase,
    );
    expect(phrase).toHaveValue("unfinished recovery phrase");
    expect(newPassword).toHaveValue("unsaved recovery password");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onExitRecovery).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Unlock vault" })).toBeVisible();
  });
  it("starts Settings at the top and moves focus without a second scroll", async () => {
    const setup = gallerySetup("ready");
    const user = userEvent.setup();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    render(
      <OptionsView
        preference="dark"
        onThemeChange={() => {}}
        assessPassword={async () => ({ score: 4 })}
        setup={setup}
        workspace={galleryWorkspace()}
        sync={gallerySync()}
        devices={galleryDevices()}
        vaultSettings={galleryVaultSettings()}
        tagManagement={galleryTagManagement()}
        folderManagement={galleryFolderManagement()}
      />,
    );

    await screen.findByRole("heading", { name: "Entries" });
    const scroller = document.scrollingElement ?? document.documentElement;
    scroller.scrollTop = 320;
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const settings = await screen.findByRole("heading", {
      name: "Vault settings",
    });
    expect(settings.closest("[data-focus-target]")).toHaveFocus();
    expect(scroller.scrollTop).toBe(0);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it("retains Sync and its draft during soft inspection, then clears them on session invalidation", async () => {
    const user = userEvent.setup();
    const setup = gallerySetup();
    const unlocked = { ...setupVault, complete: true, unlocked: true };
    const initial = { vault: unlocked, vaults: [unlocked] };
    setup.inspect = async () => initial;
    let invalidate: (clearDraft?: boolean) => void = () => {};
    setup.subscribe = (callback) => {
      invalidate = callback;
      return () => {};
    };
    render(
      <OptionsView
        preference="dark"
        onThemeChange={() => {}}
        assessPassword={async () => ({ score: 4 })}
        setup={setup}
        workspace={galleryWorkspace()}
        sync={gallerySync()}
        devices={galleryDevices()}
        vaultSettings={galleryVaultSettings()}
        tagManagement={galleryTagManagement()}
        folderManagement={galleryFolderManagement()}
      />,
    );
    await screen.findByRole("heading", { name: "Entries" });
    await user.click(screen.getByRole("button", { name: "Sync" }));
    await user.click(
      await screen.findByRole("button", { name: "I already have storage" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "S3 bucket name" }),
      "personal-vault",
    );
    await user.type(
      screen.getByRole("textbox", { name: "S3 region" }),
      "eu-central-1",
    );
    await user.click(
      await screen.findByRole("button", { name: "Continue to access keys" }),
    );
    const key = screen.getByLabelText("Secret access key", { exact: true });
    fireEvent.change(key, { target: { value: "synthetic-unsaved-key" } });
    let finish: (value: SetupInspection) => void = () => {};
    setup.inspect = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    await act(async () => invalidate(false));
    expect(screen.getByRole("heading", { name: "Sync" })).toBeVisible();
    expect(
      screen.getByLabelText("Secret access key", { exact: true }),
    ).toHaveValue("synthetic-unsaved-key");
    await act(async () => finish(initial));
    expect(
      screen.getByLabelText("Secret access key", { exact: true }),
    ).toHaveValue("synthetic-unsaved-key");
    await act(async () => invalidate(true));
    expect(
      screen.queryByLabelText("Secret access key", { exact: true }),
    ).not.toBeInTheDocument();
    await act(async () =>
      finish({ vault: { ...unlocked, unlocked: false }, vaults: [unlocked] }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Unlock vault" }),
      ).toBeVisible(),
    );
  });
});
