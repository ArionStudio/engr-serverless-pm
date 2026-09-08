// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { gallerySync } from "@/gallery/sync-fixture";
import { SyncAccessKeys } from "./sync-access-keys.view";
import type { RevealedSyncKeys, SyncCapabilities } from "./sync.type";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const keys: RevealedSyncKeys = {
  accessKeyId: "fixture-id",
  secretAccessKey: "fixture-secret",
  sessionId: "fixture-session",
};
function setup() {
  let notify: Parameters<SyncCapabilities["subscribe"]>[0] = () => {};
  const capabilities = {
    ...gallerySync("sync-configured"),
    revealAccessKeys: vi.fn(async () => keys),
    copyAccessKey: vi.fn(async () => {}),
    subscribe: (listener: typeof notify) => {
      notify = listener;
      return () => {};
    },
  };
  const view = render(
    <SyncAccessKeys vaultId="vault" capabilities={capabilities} />,
  );
  return {
    ...view,
    capabilities,
    notify: (reason: "session" | "pagehide" = "session") => notify(reason),
  };
}
async function reveal() {
  fireEvent.click(
    screen.getByRole("button", { name: "Show sync access keys" }),
  );
  fireEvent.change(screen.getByLabelText("Vault password"), {
    target: { value: "entered-password" },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Reveal access keys" }));
  });
}

it("requires password confirmation, copies each key, and hides after 30 seconds", async () => {
  vi.useFakeTimers();
  const { capabilities } = setup();
  expect(capabilities.revealAccessKeys).not.toHaveBeenCalled();
  expect(screen.queryByText(keys.secretAccessKey)).toBeNull();
  await reveal();
  expect(capabilities.revealAccessKeys).toHaveBeenCalledWith(
    "vault",
    "entered-password",
  );
  expect(screen.queryByLabelText("Vault password")).toBeNull();
  expect(screen.getByText(keys.secretAccessKey)).toBeTruthy();
  for (const [label, value] of [
    ["Copy access key ID", keys.accessKeyId],
    ["Copy secret access key", keys.secretAccessKey],
  ]) {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: label }));
    });
    expect(capabilities.copyAccessKey).toHaveBeenLastCalledWith(
      "vault",
      keys.sessionId,
      value,
    );
  }
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.queryByText(keys.secretAccessKey)).toBeNull();
  expect(
    screen.getByRole("button", { name: "Show sync access keys" }),
  ).toBeTruthy();
});

it("clears the password and reports a safe error after failed verification", async () => {
  const { capabilities } = setup();
  capabilities.revealAccessKeys.mockRejectedValue(
    new Error("private provider details"),
  );
  await reveal();
  expect(
    (screen.getByLabelText("Vault password") as HTMLInputElement).value,
  ).toBe("");
  expect(screen.getByRole("alert").textContent).toContain(
    "Check this device's vault password",
  );
  expect(screen.queryByText("private provider details")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Copy secret access key" }),
  ).toBeNull();
});

it.each(["session", "pagehide"] as const)(
  "hides on focus loss and %s and ignores an in-flight reveal",
  async (reason) => {
    const { capabilities, notify } = setup();
    await reveal();
    fireEvent.blur(window);
    expect(screen.queryByText(keys.secretAccessKey)).toBeNull();
    let resolve: (value: RevealedSyncKeys) => void = () => {};
    capabilities.revealAccessKeys.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await reveal();
    act(() => notify(reason));
    await act(async () => resolve(keys));
    expect(screen.queryByText(keys.secretAccessKey)).toBeNull();
    expect(screen.queryByLabelText("Vault password")).toBeNull();
  },
);

it.each([
  "VaultMustBeUnlockedError",
  "UnlockedVaultSessionExpiredError",
  "UnlockedVaultSessionInvalidError",
  "unverifiable",
])(
  "conceals keys when copy fails with %s before a session notification",
  async (name) => {
    const { capabilities } = setup();
    const failure = new Error("private failure details");
    failure.name = name;
    capabilities.copyAccessKey.mockRejectedValueOnce(failure);
    capabilities.inspectManagement = vi.fn(capabilities.inspectManagement);
    if (name === "unverifiable")
      capabilities.inspectManagement = vi.fn(async () => {
        throw new Error("Storage unavailable");
      });
    await reveal();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Copy secret access key" }),
      ),
    );
    expect(screen.queryByText(keys.secretAccessKey)).toBeNull();
    expect(screen.queryByText(keys.accessKeyId)).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(
      "vault access could not be verified",
    );
    expect(screen.queryByText("private failure details")).toBeNull();
    if (name !== "unverifiable")
      expect(capabilities.inspectManagement).not.toHaveBeenCalled();
  },
);

it("keeps revealed keys after a clipboard failure only when the session can still be verified", async () => {
  const { capabilities } = setup();
  capabilities.copyAccessKey.mockRejectedValueOnce(
    new Error("Clipboard unavailable"),
  );
  capabilities.inspectManagement = vi.fn(capabilities.inspectManagement);
  await reveal();
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Copy secret access key" }),
    ),
  );
  expect(capabilities.inspectManagement).toHaveBeenCalledWith("vault");
  expect(screen.getByText(keys.secretAccessKey)).toBeTruthy();
});
