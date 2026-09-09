import { galleryPopupSync } from "@/gallery/popup-sync-fixture";
import { galleryBrowserLogins } from "@/gallery/browser-login-fixture";
import { ThemeProvider } from "@/ui/features/theme";
import { within } from "@testing-library/react";
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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("retains a rejected unlock password for correction and opens recovery in Options", async () => {
  const setup = gallerySetup();
  const vault = { ...setupVault, complete: true, unlocked: false };
  setup.inspect = async () => ({ vault, vaults: [vault] });
  setup.unlock = vi.fn(async () => {
    throw new Error("Rejected");
  });
  const open = vi.fn(async () => {});
  const user = userEvent.setup();

  render(
    <PopupWorkspace
      setup={setup}
      workspace={galleryWorkspace()}
      onOpenOptions={open}
    />,
  );

  const password = await screen.findByLabelText("Vault password");
  expect(
    screen.queryByRole("combobox", { name: "Vault" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Personal vault")).toBeVisible();
  await user.type(password, "wrong password");
  await user.click(screen.getByRole("button", { name: "Unlock vault" }));

  expect(
    await screen.findByText(
      "Could not unlock this vault. Check your password and try again.",
    ),
  ).toBeVisible();
  expect(password).toHaveValue("wrong password");

  await user.click(screen.getByRole("button", { name: "Forgot password?" }));
  expect(open).toHaveBeenCalledWith("recover-access");
});

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
    screen.getByRole("combobox", { name: "Search entries" }),
    "unmatched",
  );
  expect(screen.getByText("No matching entries")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Clear search" }));
  await user.click(
    screen.getByRole("button", { name: /adrian@example\.test/ }),
  );
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

it("starts a local entry draft from the empty vault action", async () => {
  const setup = gallerySetup();
  const vault = { ...setupVault, complete: true, unlocked: true };
  setup.inspect = async () => ({ vault, vaults: [vault] });
  const user = userEvent.setup();
  render(
    <PopupWorkspace
      setup={setup}
      workspace={galleryWorkspace("workspace-empty")}
      onOpenOptions={async () => {}}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Add entry" }));
  expect(screen.getByRole("heading", { name: "Add entry" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Website" })).toHaveValue(
    "https://mail.example.test/sign-in",
  );
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
          onDraftConsumed={() => {}}
          onStateChange={() => {}}
          onOpenSync={() => {}}
          onLock={() => {}}
        />
      ) : (
        <EntryWorkspace
          vaultId="vault"
          capabilities={capabilities}
          onDraftConsumed={() => {}}
          onLock={() => {}}
          onSync={() => {}}
        />
      ),
    );
    await screen.findByText("adrian@example.test");
    const search = screen.getByRole("combobox", { name: "Search entries" });
    await user.type(search, "private query");
    await act(async () => notify("data"));
    expect(search).toHaveValue("private query");
    await act(async () => notify("session"));
    expect(
      screen.getByRole("combobox", { name: "Search entries" }),
    ).toHaveValue("");
    expect(await screen.findByText("adrian@example.test")).toBeVisible();
  },
);

it.each(["popup", "options"])(
  "identifies the selected duplicate login by website before deletion in %s",
  async (surface) => {
    const user = userEvent.setup();
    const capabilities = galleryWorkspace();
    const data = await capabilities.read("vault");
    const original = data.entries[0];
    const selected = {
      ...original,
      id: "entry-work",
      sanitizedUrl: "https://work.example.test/login",
    };
    capabilities.read = async () => ({
      ...data,
      entries: [original, selected],
    });
    capabilities.details = async (_, entryId) => ({
      entry: entryId === selected.id ? selected : original,
      entryVersionVector: { gallery: 1 },
    });
    capabilities.remove = vi.fn(capabilities.remove);

    render(
      surface === "popup" ? (
        <PopupEntries
          vaultId="vault"
          capabilities={capabilities}
          onDraftConsumed={() => {}}
          onStateChange={() => {}}
          onOpenSync={() => {}}
          onLock={() => {}}
        />
      ) : (
        <EntryWorkspace
          vaultId="vault"
          capabilities={capabilities}
          onDraftConsumed={() => {}}
          onLock={() => {}}
          onSync={() => {}}
        />
      ),
    );

    const originalActionName = `Open ${original.login} at ${original.sanitizedUrl}`;
    const selectedActionName = `Open ${selected.login} at ${selected.sanitizedUrl}`;
    expect(
      await screen.findByRole("button", { name: originalActionName }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: selectedActionName }),
    ).toBeVisible();
    await user.type(
      screen.getByRole("combobox", { name: "Search entries" }),
      "work.example.test",
    );
    await user.click(
      screen.getByRole("button", {
        name: selectedActionName,
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Delete entry" }),
    );

    expect(
      screen.getByRole("alertdialog", {
        name: `Delete entry: ${selected.login} at ${selected.sanitizedUrl}`,
      }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete entry" }));
    await waitFor(() =>
      expect(capabilities.remove).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: selected.id }),
      ),
    );
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
          onDraftConsumed={() => {}}
          onStateChange={() => {}}
          onOpenSync={() => {}}
          onLock={() => {}}
        />
      ) : (
        <EntryWorkspace
          vaultId="vault"
          capabilities={capabilities}
          onDraftConsumed={() => {}}
          onLock={() => {}}
          onSync={() => {}}
        />
      ),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Open adrian@example.test at https://mail.example.test/login",
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
    await screen.findByRole("button", { name: /adrian@example\.test/ }),
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
    const onHide = () => listener("pagehide");
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

it("keeps entry creation and generators in the popup and reserves Options for configuration", async () => {
  const setup = gallerySetup();
  const vault = { ...setupVault, complete: true, unlocked: true };
  setup.inspect = async () => ({ vault, vaults: [vault] });
  const open = vi.fn(async () => {});
  const workspace = galleryWorkspace();
  let finishCopy!: () => void;
  workspace.tools.copy = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishCopy = resolve;
      }),
  );
  const user = userEvent.setup();
  render(
    <PopupWorkspace setup={setup} workspace={workspace} onOpenOptions={open} />,
  );
  const navigation = await screen.findByRole("navigation", {
    name: "Popup navigation",
  });
  await user.click(await screen.findByRole("button", { name: "New" }));
  expect(screen.getByRole("heading", { name: "Add entry" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Website" })).toHaveValue(
    "https://mail.example.test/sign-in",
  );
  expect(open).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Generator" }));
  expect(screen.getByRole("tab", { name: "Password" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Generate password" }));
  expect(await screen.findByText("Concealed")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Copy" }));
  expect(
    within(navigation).getByRole("button", { name: "Vault" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Open Options" })).toBeDisabled();
  await act(async () => finishCopy());
  await waitFor(() =>
    expect(
      within(navigation).getByRole("button", { name: "Vault" }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Use in new entry" }));
  expect(screen.getByRole("heading", { name: "Add entry" })).toBeVisible();
  expect(open).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Open Options" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Open Options" }));
  expect(open).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledWith(undefined);
});

it("discards a cancelled entry draft before switching popup tools", async () => {
  const setup = gallerySetup();
  const vault = { ...setupVault, complete: true, unlocked: true };
  setup.inspect = async () => ({ vault, vaults: [vault] });
  const user = userEvent.setup();
  render(
    <PopupWorkspace
      setup={setup}
      workspace={galleryWorkspace()}
      onOpenOptions={async () => {}}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "New" }));
  await user.type(screen.getByRole("textbox", { name: "Login" }), "cancelled");
  expect(screen.getByRole("button", { name: "Generator" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Generator" }));
  await user.click(screen.getByRole("button", { name: "Vault" }));

  expect(screen.queryByDisplayValue("cancelled")).not.toBeInTheDocument();
  expect(screen.getByText("All entries")).toBeVisible();
});

it("keeps popup navigation available in entry details and leaves details cleanly", async () => {
  const setup = gallerySetup();
  const vault = { ...setupVault, complete: true, unlocked: true };
  setup.inspect = async () => ({ vault, vaults: [vault] });
  const user = userEvent.setup();
  render(
    <PopupWorkspace
      setup={setup}
      workspace={galleryWorkspace()}
      onOpenOptions={async () => {}}
    />,
  );

  await user.click(
    await screen.findByRole("button", { name: /adrian@example\.test/ }),
  );
  expect(
    await screen.findByRole("region", { name: "Entry details" }),
  ).toBeVisible();
  const navigation = screen.getByRole("navigation", {
    name: "Popup navigation",
  });
  for (const name of ["Vault", "Generator", "Settings"]) {
    expect(within(navigation).getByRole("button", { name })).toBeEnabled();
  }

  await user.click(within(navigation).getByRole("button", { name: "Vault" }));
  expect(await screen.findByText("All entries")).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "Entry details" }),
  ).not.toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: /adrian@example\.test/ }),
  );
  await screen.findByRole("region", { name: "Entry details" });
  await user.click(
    within(navigation).getByRole("button", { name: "Generator" }),
  );
  expect(await screen.findByRole("tab", { name: "Password" })).toBeVisible();
  await user.click(within(navigation).getByRole("button", { name: "Vault" }));
  expect(await screen.findByText("All entries")).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "Entry details" }),
  ).not.toBeInTheDocument();
});

it("prevents Options navigation from discarding an entry draft", async () => {
  const setup = gallerySetup();
  const vault = { ...setupVault, complete: true, unlocked: true };
  setup.inspect = async () => ({ vault, vaults: [vault] });
  let notify: (clearDraft?: boolean) => void = () => {};
  setup.subscribe = (callback) => {
    notify = callback;
    return () => {};
  };
  const open = vi.fn(async () => {});
  const user = userEvent.setup();
  render(
    <PopupWorkspace
      setup={setup}
      workspace={galleryWorkspace()}
      onOpenOptions={open}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "New" }));
  const login = screen.getByRole("textbox", { name: "Login" });
  await user.type(login, "unfinished@example.test");
  await act(async () => notify(false));
  expect(screen.getByRole("textbox", { name: "Login" })).toBe(login);
  expect(login).toHaveValue("unfinished@example.test");
  expect(screen.getByRole("button", { name: "Open Options" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Open Options" }));

  expect(open).toHaveBeenCalledWith(undefined);
});

it("keeps captured review and the detection switch in Detected without opening Options", async () => {
  const user = userEvent.setup();
  const setup = gallerySetup();
  const vault = { ...setupVault, complete: true, unlocked: true };
  setup.inspect = async () => ({ vault, vaults: [vault] });
  const browser = galleryBrowserLogins("save");
  browser.setDetection = vi.fn(browser.setDetection);
  const open = vi.fn(async () => {});
  render(
    <PopupWorkspace
      setup={setup}
      workspace={galleryWorkspace()}
      browserLogins={browser}
      onOpenOptions={open}
    />,
  );
  const nav = await screen.findByRole("navigation", {
    name: "Popup navigation",
  });
  expect(screen.queryByText("Save this login?")).not.toBeInTheDocument();
  await user.click(within(nav).getByRole("button", { name: "Detected" }));
  await screen.findByText("Save this login?");
  await user.click(screen.getByText("Login detection", { exact: true }));
  await waitFor(() => expect(browser.setDetection).toHaveBeenCalledWith(true));
  expect(screen.getByRole("switch", { name: "Login detection" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Review new login" }));
  await screen.findByRole("heading", { name: "Add entry" });
  expect(screen.getByLabelText("Login", { exact: true })).toHaveValue(
    "alex@example.com",
  );
  expect(within(nav).getByRole("button", { name: "Settings" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await screen.findByText("Save this login?")).toBeVisible();
  expect(open).not.toHaveBeenCalled();
});
it("saves popup device settings, keeps failed drafts, and applies appearance locally", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  try {
    const user = userEvent.setup();
    const setup = gallerySetup();
    const vault = { ...setupVault, complete: true, unlocked: true };
    setup.inspect = async () => ({ vault, vaults: [vault] });
    const saveDevice = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue(undefined);
    const open = vi.fn(async () => {});
    render(
      <ThemeProvider>
        <PopupWorkspace
          setup={setup}
          workspace={galleryWorkspace()}
          settings={{ saveDevice, inspectAuthorization: async () => {} }}
          onOpenOptions={open}
        />
      </ThemeProvider>,
    );
    const nav = await screen.findByRole("navigation", {
      name: "Popup navigation",
    });
    await user.click(within(nav).getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(localStorage.getItem("spm-theme")).toBe("dark");
    await act(async () =>
      window.dispatchEvent(
        new StorageEvent("storage", { key: "spm-theme", newValue: "light" }),
      ),
    );
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const name = screen.getByLabelText("Device name");
    await user.clear(name);
    await user.type(name, "Clarke browser");
    expect(within(nav).getByRole("button", { name: "Vault" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Could not save browser settings. Try again.");
    expect(name).toHaveValue("Clarke browser");
    let finishInspection: (
      value: Awaited<ReturnType<typeof setup.inspect>>,
    ) => void = () => {};
    const inspection = new Promise<Awaited<ReturnType<typeof setup.inspect>>>(
      (resolve) => {
        finishInspection = resolve;
      },
    );
    setup.inspect = () => inspection;
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(within(nav).getByRole("button", { name: "Vault" })).toBeEnabled(),
    );
    await screen.findByText(
      "Browser settings saved. The lock duration applies from the next unlock.",
    );
    expect(screen.getByLabelText("Device name")).toBe(name);
    expect(name).toHaveValue("Clarke browser");
    await act(async () =>
      finishInspection({
        vault: { ...vault, deviceName: "Clarke browser" },
        vaults: [vault],
      }),
    );
    expect(screen.getByLabelText("Device name")).toBe(name);
    expect(saveDevice).toHaveBeenLastCalledWith(
      vault.vaultId,
      "Clarke browser",
      vault.duration,
    );
    expect(open).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    localStorage.removeItem("spm-theme");
  }
});

it("shows one sync panel only on the Vault list while checking once even when opened on Detected", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const setup = gallerySetup();
  const vault = { ...setupVault, complete: true, unlocked: true };
  setup.inspect = async () => ({ vault, vaults: [vault] });
  const sync = galleryPopupSync();
  sync.review = vi.fn(sync.review);
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <PopupWorkspace
        setup={setup}
        workspace={galleryWorkspace()}
        browserLogins={galleryBrowserLogins()}
        sync={sync}
        initialRoute="detected"
        onOpenOptions={async () => {}}
      />
    </ThemeProvider>,
  );
  await waitFor(() => expect(sync.review).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("region", { name: "Vault sync" })).toBeNull();
  for (const name of ["Vault", "Settings", "Detected", "Generator", "Vault"]) {
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Popup navigation" }),
      ).getByRole("button", { name }),
    );
    expect(
      screen.queryAllByRole("region", { name: "Vault sync" }),
    ).toHaveLength(name === "Vault" ? 1 : 0);
  }
  expect(
    screen.getAllByRole("region", { name: "Vault sync", hidden: true }),
  ).toHaveLength(1);
  expect(sync.review).toHaveBeenCalledTimes(1);
});

it.each(["popup", "options"])(
  "reports a rejected %s reveal without exposing the cause and permits retry",
  async (surface) => {
    const user = userEvent.setup();
    const capabilities = galleryWorkspace();
    const edit = capabilities.edit;
    capabilities.edit = vi
      .fn()
      .mockRejectedValueOnce(new Error("private repository details"))
      .mockImplementation(edit);
    render(
      surface === "popup" ? (
        <PopupEntries
          vaultId="vault"
          capabilities={capabilities}
          onDraftConsumed={() => {}}
          onStateChange={() => {}}
          onOpenSync={() => {}}
          onLock={() => {}}
        />
      ) : (
        <EntryWorkspace
          vaultId="vault"
          capabilities={capabilities}
          onDraftConsumed={() => {}}
          onLock={() => {}}
          onSync={() => {}}
        />
      ),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Open adrian@example.test at https://mail.example.test/login",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Reveal" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent(
      "private repository details",
    );
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Reload entries" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(
      await screen.findByText("Gallery-River-8!Pine-Sky", { exact: true }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);
