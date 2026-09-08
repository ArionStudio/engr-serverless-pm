// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { gallerySetup, setupVault } from "@/gallery/setup-fixture";
import { galleryWorkspace } from "@/gallery/workspace-fixture";
import { PopupEntries } from "./popup-entries.view";
import { EntryWorkspace } from "@/ui/features/entries/entry-workspace.view";
import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";
import { PopupWorkspace } from "./popup-workspace.view";
afterEach(cleanup);
it("searches visible fields and copies through the capability without reading a password into the list", async () => {
  const user = userEvent.setup();
  const setup = gallerySetup();
  let vault = { ...setupVault, complete: true };
  setup.inspect = async () => ({ vault, vaults: [vault] });
  let invalidate = () => {};
  setup.subscribe = (listener) => {
    invalidate = listener;
    return () => {};
  };
  const workspace = galleryWorkspace();
  workspace.copy = vi.fn(async () => {});
  workspace.edit = vi.fn(workspace.edit);
  render(
    <PopupWorkspace
      setup={setup}
      workspace={workspace}
      onOpenOptions={async () => {}}
    />,
  );
  await screen.findByText("adrian@example.test");
  expect(workspace.edit).not.toHaveBeenCalled();
  await user.type(
    screen.getByRole("textbox", { name: "Search entries" }),
    "unmatched",
  );
  expect(screen.getByText("No matching entries")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Clear search" }));
  await user.click(screen.getByRole("button", { name: "adrian@example.test" }));
  await user.click(
    await screen.findByRole("button", { name: "Copy password" }),
  );
  await waitFor(() =>
    expect(workspace.copy).toHaveBeenCalledWith(
      "gallery-vault",
      "entry-review",
    ),
  );
  expect(workspace.edit).not.toHaveBeenCalled();
  await act(async () => {
    vault = { ...vault, unlocked: false };
    invalidate();
  });
  expect(
    await screen.findByRole("heading", { name: "Unlock vault" }),
  ).toBeVisible();
  expect(screen.queryByText("adrian@example.test")).not.toBeInTheDocument();
});
it("hands incomplete setup to Options", async () => {
  const setup = gallerySetup();
  setup.inspect = async () => ({ vault: setupVault, vaults: [setupVault] });
  const open = vi.fn(async () => {});
  const user = userEvent.setup();
  render(
    <PopupWorkspace
      setup={setup}
      workspace={galleryWorkspace()}
      onOpenOptions={open}
    />,
  );
  await user.click(
    await screen.findByRole("button", { name: "Continue in Options" }),
  );
  expect(open).toHaveBeenCalledOnce();
  expect(screen.queryByText("adrian@example.test")).not.toBeInTheDocument();
});

it.each(["popup", "options"])(
  "clears %s search on same-vault session replacement",
  async (surface) => {
    const user = userEvent.setup();
    const capabilities = galleryWorkspace();
    let notify: Parameters<WorkspaceCapabilities["subscribe"]>[0] = () => {};
    capabilities.subscribe = (listener) => {
      notify = listener;
      return () => {};
    };
    render(
      surface === "popup" ? (
        <PopupEntries
          vaultId="vault"
          capabilities={capabilities}
          onLock={() => {}}
        />
      ) : (
        <EntryWorkspace
          vaultId="vault"
          capabilities={capabilities}
          onLock={() => {}}
          onSync={() => {}}
        />
      ),
    );
    await screen.findByText("adrian@example.test");
    const search = screen.getByRole("textbox", { name: "Search entries" });
    await user.type(search, "private query");
    await act(async () => notify("data"));
    expect(search).toHaveValue("private query");
    await act(async () => notify("session"));
    expect(screen.getByRole("textbox", { name: "Search entries" })).toHaveValue(
      "",
    );
    expect(await screen.findByText("adrian@example.test")).toBeVisible();
  },
);

it.each(["popup", "options"])(
  "reports revealing separately from copying in %s",
  async (surface) => {
    const user = userEvent.setup();
    const capabilities = galleryWorkspace();
    const record = await capabilities.edit("vault", "entry-review");
    let resolve!: (value: typeof record) => void;
    capabilities.edit = () =>
      new Promise((done) => {
        resolve = done;
      });
    capabilities.copy = vi.fn(async () => {});
    render(
      surface === "popup" ? (
        <PopupEntries
          vaultId="vault"
          capabilities={capabilities}
          onLock={() => {}}
        />
      ) : (
        <EntryWorkspace
          vaultId="vault"
          capabilities={capabilities}
          onLock={() => {}}
          onSync={() => {}}
        />
      ),
    );
    await user.click(
      await screen.findByRole("button", {
        name:
          surface === "popup"
            ? "adrian@example.test"
            : "Open adrian@example.test",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Reveal" }));
    expect(screen.getByText("Retrieving…")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy password" }),
    ).toBeDisabled();
    expect(screen.queryByText("Copying…")).not.toBeInTheDocument();
    expect(capabilities.copy).not.toHaveBeenCalled();
    await act(async () => resolve(record));
    expect(
      screen.getByText(record.entry.password, { exact: true }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy password" })).toBeEnabled();
  },
);

it("returns to unlock after an action revokes access without a storage event", async () => {
  const user = userEvent.setup();
  const setup = gallerySetup();
  let vault = { ...setupVault, complete: true };
  setup.inspect = async () => ({ vault, vaults: [vault] });
  setup.subscribe = () => () => {};
  const workspace = galleryWorkspace();
  workspace.subscribe = () => () => {};
  workspace.copy = async () => {
    vault = { ...vault, unlocked: false };
    workspace.read = async () => {
      throw new Error("Session persistence unavailable");
    };
    throw new Error("Clipboard action failed");
  };
  render(
    <PopupWorkspace
      setup={setup}
      workspace={workspace}
      onOpenOptions={async () => {}}
    />,
  );
  await user.click(
    await screen.findByRole("button", { name: "adrian@example.test" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Copy password" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Unlock vault" }),
  ).toBeVisible();
  expect(screen.queryByText("adrian@example.test")).not.toBeInTheDocument();
});

it("does not remount a closing workspace when a failed-lock error is cleared", async () => {
  const user = userEvent.setup();
  const setup = gallerySetup();
  const vault = { ...setupVault, complete: true };
  setup.inspect = async () => ({ vault, vaults: [vault] });
  setup.lock = async () => {
    throw new Error("Clipboard coordination unavailable");
  };
  setup.subscribe = (listener) => {
    const onHide = () => listener();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  };
  const workspace = galleryWorkspace();
  workspace.subscribe = () => () => {};
  workspace.read = vi.fn(workspace.read);
  render(
    <PopupWorkspace
      setup={setup}
      workspace={workspace}
      onOpenOptions={async () => {}}
    />,
  );
  await screen.findByText("adrian@example.test");
  await user.click(screen.getByRole("button", { name: "Lock vault" }));
  expect(
    await screen.findByText("Could not lock the vault. Try again."),
  ).toBeVisible();
  expect(await screen.findByText("adrian@example.test")).toBeVisible();
  expect(workspace.read).toHaveBeenCalledTimes(2);
  await act(async () =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  expect(screen.queryByText("adrian@example.test")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Could not lock the vault. Try again."),
  ).not.toBeInTheDocument();
  expect(workspace.read).toHaveBeenCalledTimes(2);
});
