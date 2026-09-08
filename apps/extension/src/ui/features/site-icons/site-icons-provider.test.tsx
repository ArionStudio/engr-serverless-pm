// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SiteIconsProvider } from "./site-icons-provider.view";
import { SiteIconSettings } from "./site-icon-settings.view";
import type {
  SiteIconCapabilities,
  SiteIconPreference,
} from "./site-icons.type";

afterEach(cleanup);
it.each([
  {
    failure: "initial read",
    failedRead: 1,
    enableFirst: false,
    mutationFails: false,
    expectedEnabled: false,
  },
  {
    failure: "read after enabling",
    failedRead: 2,
    enableFirst: true,
    mutationFails: false,
    expectedEnabled: true,
  },
  {
    failure: "reconciliation read after a failed mutation",
    failedRead: 2,
    enableFirst: true,
    mutationFails: true,
    expectedEnabled: false,
  },
])(
  "retries settings after $failure without repeating the mutation",
  async ({ failedRead, enableFirst, mutationFails, expectedEnabled }) => {
    let enabled = false;
    let readCount = 0;
    const read = vi.fn(async () => {
      readCount += 1;
      if (readCount === failedRead) throw new Error("Storage unavailable.");
      return { supported: true, enabled, cleanupRequired: false };
    });
    const setEnabled = vi.fn(async (next: boolean) => {
      if (mutationFails) throw new Error("Mutation failed.");
      enabled = next;
    });
    const capabilities: SiteIconCapabilities = {
      read,
      setEnabled,
      subscribe: () => () => {},
      source: () => undefined,
    };
    render(
      <SiteIconsProvider capabilities={capabilities}>
        <SiteIconSettings />
      </SiteIconsProvider>,
    );
    const user = userEvent.setup();

    if (enableFirst) {
      await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
      await user.click(screen.getByText("Website icons"));
    }

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not read website icon settings",
    );
    await user.click(screen.getByRole("button", { name: "Retry settings" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      String(expectedEnabled),
    );
    expect(setEnabled).toHaveBeenCalledTimes(enableFirst ? 1 : 0);
  },
);
it("preserves another context's committed enable after enable cleanup fails", async () => {
  let readCount = 0;
  const setEnabled = vi.fn(async (enabled: boolean) => {
    if (enabled)
      throw Object.assign(new Error("Rollback check failed."), {
        name: "SiteIconCleanupError",
      });
  });
  const capabilities: SiteIconCapabilities = {
    read: async () => {
      readCount += 1;
      return {
        supported: true,
        enabled: readCount > 1,
        cleanupRequired: false,
      };
    },
    setEnabled,
    subscribe: () => () => {},
    source: () => undefined,
  };
  render(
    <SiteIconsProvider capabilities={capabilities}>
      <SiteIconSettings />
    </SiteIconsProvider>,
  );
  const toggle = await screen.findByRole("switch");
  await waitFor(() => expect(toggle).toBeEnabled());

  await userEvent.setup().click(screen.getByText("Website icons"));

  await waitFor(() => expect(toggle).toBeChecked());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry cleanup" })).toBeNull();
  expect(setEnabled).toHaveBeenCalledOnce();
  expect(setEnabled).toHaveBeenCalledWith(true);
  expect(setEnabled).not.toHaveBeenCalledWith(false);
});
it("keeps settings pending until the newest overlapping read settles", async () => {
  let readCount = 0;
  let resolveFirst: (value: SiteIconPreference) => void = () => {};
  let resolveSecond: (value: SiteIconPreference) => void = () => {};
  const listeners = new Set<() => void>();
  const read = vi.fn(() => {
    readCount += 1;
    if (readCount === 1)
      return Promise.resolve({
        supported: true,
        enabled: false,
        cleanupRequired: false,
      });
    return new Promise<SiteIconPreference>((resolve) => {
      if (readCount === 2) resolveFirst = resolve;
      else resolveSecond = resolve;
    });
  });
  const capabilities: SiteIconCapabilities = {
    read,
    setEnabled: async () => {},
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    source: () => undefined,
  };
  render(
    <SiteIconsProvider capabilities={capabilities}>
      <SiteIconSettings />
    </SiteIconsProvider>,
  );
  const toggle = await screen.findByRole("switch");
  await waitFor(() => expect(toggle).toBeEnabled());

  act(() => {
    for (const listener of listeners) listener();
  });
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(toggle).toHaveAttribute("aria-disabled", "true");
  act(() => {
    for (const listener of listeners) listener();
  });
  await waitFor(() => expect(read).toHaveBeenCalledTimes(3));

  await act(async () => {
    resolveFirst({
      supported: true,
      enabled: false,
      cleanupRequired: false,
    });
  });
  expect(toggle).toHaveAttribute("aria-disabled", "true");

  await act(async () => {
    resolveSecond({
      supported: true,
      enabled: true,
      cleanupRequired: false,
    });
  });
  await waitFor(() => expect(toggle).not.toHaveAttribute("aria-disabled"));
  expect(toggle).toBeChecked();
});
it("updates both contexts on preference/revocation changes and clears obsolete denial feedback", async () => {
  let enabled = false;
  let deny = true;
  const listeners = new Set<() => void>();
  const capabilities: SiteIconCapabilities = {
    read: async () => ({ supported: true, enabled, cleanupRequired: false }),
    setEnabled: vi.fn(async (value) => {
      if (deny)
        throw Object.assign(new Error(), {
          name: "SiteIconPermissionDeniedError",
        });
      enabled = value;
      for (const listener of listeners) listener();
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    source: () => undefined,
  };
  render(
    <>
      <div data-testid="popup">
        <SiteIconsProvider capabilities={capabilities}>
          <SiteIconSettings />
        </SiteIconsProvider>
      </div>
      <div data-testid="options">
        <SiteIconsProvider capabilities={capabilities}>
          <SiteIconSettings />
        </SiteIconsProvider>
      </div>
    </>,
  );
  const popup = within(screen.getByTestId("popup"));
  const options = within(screen.getByTestId("options"));
  await waitFor(() => expect(popup.getByRole("switch")).toBeEnabled());
  const user = userEvent.setup();
  await user.click(popup.getByText("Website icons"));
  await popup.findByRole("alert");
  expect(popup.getByRole("switch")).not.toBeChecked();
  deny = false;
  await user.click(options.getByText("Website icons"));
  await waitFor(() => {
    expect(popup.getByRole("switch")).toBeChecked();
    expect(options.getByRole("switch")).toBeChecked();
    expect(popup.queryByRole("alert")).toBeNull();
  });
  await act(async () => {
    enabled = false;
    for (const listener of listeners) listener();
  });
  expect(popup.getByRole("switch")).not.toBeChecked();
  expect(options.getByRole("switch")).not.toBeChecked();
});
it("shows the authoritative enabled state when disabling fails", async () => {
  const capabilities: SiteIconCapabilities = {
    read: async () => ({
      supported: true,
      enabled: true,
      cleanupRequired: false,
    }),
    setEnabled: vi.fn(async () => {
      throw new Error("Cleanup failed.");
    }),
    subscribe: () => () => {},
    source: () => undefined,
  };
  render(
    <SiteIconsProvider capabilities={capabilities}>
      <SiteIconSettings />
    </SiteIconsProvider>,
  );
  const toggle = await screen.findByRole("switch");
  await waitFor(() => expect(toggle).toBeChecked());

  await userEvent.setup().click(screen.getByText("Website icons"));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not change website icons. Try again.",
  );
  expect(toggle).toBeChecked();
});

it.each(["permission", "preference"] as const)(
  "keeps failed %s cleanup actionable after a delayed event and reopening",
  async (failure) => {
    let enabled = true;
    let granted = true;
    const listeners = new Set<() => void>();
    const setEnabled = vi.fn(async (next: boolean) => {
      enabled = next;
      granted = next;
    });
    setEnabled.mockImplementationOnce(async (next) => {
      if (failure === "permission") enabled = next;
      else granted = next;
      throw Object.assign(new Error("Permission removal failed."), {
        name: "SiteIconCleanupError",
      });
    });
    const capabilities: SiteIconCapabilities = {
      read: async () => ({
        supported: true,
        enabled: enabled && granted,
        cleanupRequired: enabled !== granted,
      }),
      setEnabled,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      source: () => undefined,
    };
    const view = () => (
      <SiteIconsProvider capabilities={capabilities}>
        <SiteIconSettings />
      </SiteIconsProvider>
    );
    const first = render(view());
    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
    const user = userEvent.setup();
    await user.click(screen.getByText("Website icons"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "remove their browser permission",
    );
    await act(async () => {
      for (const listener of listeners) listener();
    });
    expect(screen.getByRole("button", { name: "Retry cleanup" })).toBeEnabled();
    first.unmount();
    render(view());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Finish cleanup to clear their saved setting",
    );
    expect(screen.getByRole("switch")).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Retry cleanup" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(setEnabled).toHaveBeenNthCalledWith(1, false);
    expect(setEnabled).toHaveBeenNthCalledWith(2, false);
    expect(screen.getByRole("switch")).not.toBeChecked();
  },
);
