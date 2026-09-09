// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { galleryDevices } from "@/gallery/device-fixture";
import { BrowserS3AccessAdapter } from "@/adapters/sync/browser-s3-access.adapter";
import { DeviceManagementView } from "./device-management.view";

afterEach(cleanup);
describe("device access management", () => {
  it("shows a retryable error when the initial device list cannot be read", async () => {
    const capabilities = galleryDevices();
    const healthy = await capabilities.inspect("gallery-vault");
    capabilities.inspect = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporarily unavailable"))
      .mockRejectedValueOnce(new Error("still unavailable"))
      .mockResolvedValue(healthy);

    render(
      <DeviceManagementView
        vaultId="gallery-vault"
        capabilities={capabilities}
        onOpenSync={() => {}}
      />,
    );

    await screen.findByText(/Could not load the connected devices/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Home laptop");
    expect(capabilities.inspect).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      "ReplacementSyncCredentialsUnchangedError",
      /These are the access keys already used/,
    ],
    ["LocalVaultSnapshotAheadError", /Local changes need to be uploaded/],
    ["Error", /the app could not identify the cause/],
  ])(
    "explains a %s revocation failure without exposing credentials",
    async (name, explanation) => {
      const capabilities = galleryDevices();
      const failure = new Error("private-provider-response-with-secret");
      failure.name = name;
      capabilities.revoke = vi.fn(async () => {
        throw failure;
      });
      let refresh: Parameters<typeof capabilities.subscribe>[0] = () => {};
      capabilities.subscribe = (listener) => {
        refresh = listener;
        return () => {};
      };
      const openSync = vi.fn();
      render(
        <DeviceManagementView
          vaultId="gallery-vault"
          capabilities={capabilities}
          onOpenSync={openSync}
        />,
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "Review revocation" }),
      );
      fireEvent.change(screen.getByLabelText("New access key ID"), {
        target: { value: "test-key" },
      });
      fireEvent.change(screen.getByLabelText("New secret access key"), {
        target: { value: "test-secret" },
      });
      fireEvent.click(screen.getByText("Revoke access for this device."));
      fireEvent.click(screen.getByRole("button", { name: "Revoke device" }));
      await screen.findByText(explanation);
      await act(async () => refresh(false));
      expect(screen.getByText(explanation)).toBeTruthy();
      expect(screen.queryByText(/private-provider-response/)).toBeNull();
      expect(
        screen.getByLabelText("New secret access key").getAttribute("type"),
      ).toBe("password");
      expect(
        screen.getByRole("heading", { name: "Revoke Travel laptop" }),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Open Sync" }));
      expect(openSync).toHaveBeenCalledOnce();
    },
  );
  it("routes a local-only vault to sync setup instead of offering enrollment", async () => {
    const openSync = vi.fn();
    render(
      <DeviceManagementView
        vaultId="gallery-vault"
        capabilities={galleryDevices(false, false, false)}
        onOpenSync={openSync}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Set up sync" }));
    expect(openSync).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Add a device" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve a device" }),
    ).toBeNull();
  });

  it("requires matching fingerprint confirmation before approval and invalidates it after editing", async () => {
    const capabilities = galleryDevices();
    capabilities.approve = vi.fn(capabilities.approve);
    render(
      <DeviceManagementView
        vaultId="gallery-vault"
        capabilities={capabilities}
        onOpenSync={() => {}}
      />,
    );
    await screen.findByText("Home laptop");
    fireEvent.click(screen.getByRole("button", { name: "Approve a device" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Access request" }), {
      target: { value: "request" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review access request" }),
    );
    const check = await screen.findByRole("checkbox", {
      name: "The request fingerprint matches my new device.",
    });
    expect(
      screen
        .getByRole("button", { name: "Approve device" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByText("The request fingerprint matches my new device."),
    );
    expect(check.getAttribute("aria-checked")).toBe("true");
    let reject!: (error: Error) => void;
    const file = new File(["replacement"], "request.json");
    Object.defineProperty(file, "text", {
      value: () =>
        new Promise<string>((_resolve, fail) => {
          reject = fail;
        }),
    });
    fireEvent.change(screen.getByLabelText("Choose request file"), {
      target: { files: [file] },
    });
    expect(screen.queryByRole("button", { name: "Approve device" })).toBeNull();
    expect(
      (screen.getByLabelText("Access request") as HTMLTextAreaElement).value,
    ).toBe("");
    await act(async () => reject(new Error("unreadable")));
    expect(screen.queryByRole("button", { name: "Approve device" })).toBeNull();
    expect(capabilities.approve).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Access request" }), {
      target: { value: "changed request" },
    });
    expect(screen.queryByRole("button", { name: "Approve device" })).toBeNull();
    expect(capabilities.approve).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Review access request" }),
    );
    await screen.findByRole("checkbox");
    fireEvent.click(
      screen.getByText("The request fingerprint matches my new device."),
    );
    const healthy = await capabilities.inspect("gallery-vault");
    capabilities.inspect = vi
      .fn()
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValue(healthy);
    capabilities.approve = vi.fn(async () => ({
      text: "approval",
      syncUpload: "pending" as const,
    }));
    fireEvent.click(screen.getByRole("button", { name: "Approve device" }));
    await screen.findByRole("button", { name: "Download artifact" });
    await screen.findByText(
      /Device approved locally. Retry the pending upload/,
    );
    await waitFor(() => expect(capabilities.inspect).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Could not refresh devices/)).toBeNull();
    expect(screen.getByRole("button", { name: "Open Sync" })).toBeDefined();
    expect(capabilities.approve).toHaveBeenCalledWith(
      "gallery-vault",
      "changed request",
    );
  });
  it.each(["session", "pagehide"] as const)(
    "drops a request review after %s without reading during pagehide",
    async (reason) => {
      const capabilities = galleryDevices();
      const onSessionLost = vi.fn();
      let invalidate: Parameters<typeof capabilities.subscribe>[0] = () => {};
      capabilities.subscribe = (listener) => {
        invalidate = listener;
        return () => {};
      };
      let resolve:
        | ((
            value: Awaited<ReturnType<typeof capabilities.reviewRequest>>,
          ) => void)
        | undefined;
      capabilities.reviewRequest = () =>
        new Promise((done) => {
          resolve = done;
        });
      render(
        <DeviceManagementView
          vaultId="gallery-vault"
          capabilities={capabilities}
          onOpenSync={() => {}}
          onSessionLost={onSessionLost}
        />,
      );
      await screen.findByText("Home laptop");
      const updated = await capabilities.inspect("gallery-vault");
      capabilities.inspect = vi
        .fn()
        .mockRejectedValueOnce(new Error("read unavailable"))
        .mockResolvedValue(updated);
      await act(async () => invalidate(false));
      await waitFor(() =>
        expect(capabilities.inspect).toHaveBeenCalledTimes(2),
      );
      expect(screen.queryByText(/Could not refresh devices/)).toBeNull();

      capabilities.inspect = async () => ({
        ...updated,
        devices: updated.devices.map((device) =>
          device.state === "other"
            ? { ...device, state: "revoked" as const }
            : device,
        ),
      });
      await act(async () => invalidate(false));
      await screen.findByText("Revoked");
      expect(screen.queryByText(/Could not refresh devices/)).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Review revocation" }),
      ).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Approve a device" }));
      fireEvent.change(
        screen.getByRole("textbox", { name: "Access request" }),
        { target: { value: "request" } },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Review access request" }),
      );
      const finalData = await capabilities.inspect("gallery-vault");
      capabilities.inspect = vi.fn(async () => ({
        ...finalData,
        devices: finalData.devices.map((device) => ({
          ...device,
          name: "Refreshed while reviewing",
        })),
      }));
      await act(async () => invalidate(false));
      expect(capabilities.inspect).toHaveBeenCalledOnce();
      // The latest public list is loaded without invalidating the pending request review.
      expect(
        screen.queryByText(
          "Your vault session changed. Reopen Devices to continue.",
        ),
      ).toBeNull();
      act(() => invalidate(reason === "pagehide" ? "pagehide" : true));
      await act(async () =>
        resolve?.({
          vaultId: "gallery-vault",
          deviceId: "new",
          requestId: "request",
          fingerprint: "hash",
        }),
      );
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(screen.queryByText("hash")).toBeNull();
      expect(capabilities.inspect).toHaveBeenCalledOnce();
      expect(onSessionLost).toHaveBeenCalledTimes(
        reason === "pagehide" ? 0 : 1,
      );
    },
  );
  it("requires explicit confirmation and replacement credentials for a synced device revocation", async () => {
    const capabilities = galleryDevices();
    capabilities.revoke = vi.fn(capabilities.revoke);
    const request = vi.fn(async () => true);
    const access = new BrowserS3AccessAdapter({
      request,
      contains: vi.fn(async () => true),
    });
    capabilities.requestAccess = (location) => access.request(location);
    render(
      <DeviceManagementView
        vaultId="gallery-vault"
        capabilities={capabilities}
        onOpenSync={() => {}}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Review revocation" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Show new secret access key" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Review revocation" }));
    expect(
      screen.getByLabelText("New secret access key").getAttribute("type"),
    ).toBe("password");
    fireEvent.click(screen.getByText("Revoke access for this device."));
    expect(
      screen
        .getByRole("button", { name: "Revoke device" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByLabelText("Bucket").getAttribute("readonly"),
    ).not.toBeNull();
    for (const [label, value] of [
      ["New access key ID", "new-key"],
      ["New secret access key", "new-secret"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const inspect = capabilities.inspect;
    capabilities.inspect = vi
      .fn(inspect)
      .mockRejectedValueOnce(new Error("refresh failed"));
    fireEvent.click(screen.getByRole("button", { name: "Revoke device" }));
    await waitFor(() => expect(capabilities.revoke).toHaveBeenCalledOnce());
    await screen.findByText(/Delete its old S3 keys/);
    await waitFor(() => expect(capabilities.inspect).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Could not refresh devices/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Review revocation" }),
    ).toBeNull();
    expect(request).toHaveBeenCalledWith({
      origins: ["https://personal-vault.s3.eu-central-1.amazonaws.com/*"],
    });
  });
  it("clears an approval draft and output after confirmed authorization loss", async () => {
    const capabilities = galleryDevices();
    const onSessionLost = vi.fn();
    render(
      <DeviceManagementView
        vaultId="gallery-vault"
        capabilities={capabilities}
        onOpenSync={() => {}}
        onSessionLost={onSessionLost}
      />,
    );
    await screen.findByText("Home laptop");
    fireEvent.click(screen.getByRole("button", { name: "Approve a device" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Access request" }), {
      target: { value: "private enrollment request" },
    });
    const failure = new Error("expired");
    failure.name = "UnlockedVaultSessionExpiredError";
    capabilities.reviewRequest = vi.fn(async () => {
      throw failure;
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review access request" }),
    );
    await waitFor(() => expect(onSessionLost).toHaveBeenCalledOnce());
    expect(screen.queryByDisplayValue("private enrollment request")).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Access request" }),
    ).toBeNull();
  });
});

it("requests S3 permission before approval and allows retry after a denied grant", async () => {
  const capabilities = galleryDevices();
  const request = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const access = new BrowserS3AccessAdapter({
    request,
    contains: vi.fn(async () => false),
  });
  capabilities.requestAccess = (location) => access.request(location);
  capabilities.approve = vi.fn(capabilities.approve);
  render(
    <DeviceManagementView
      vaultId="gallery-vault"
      capabilities={capabilities}
      onOpenSync={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Approve a device" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Access request" }), {
    target: { value: "request" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Review access request" }),
  );
  fireEvent.click(
    await screen.findByRole("checkbox", {
      name: "The request fingerprint matches my new device.",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve device" }));
  await screen.findByText(/Storage access is not allowed in this browser/);
  expect(request).toHaveBeenCalledWith({
    origins: ["https://personal-vault.s3.eu-central-1.amazonaws.com/*"],
  });
  expect(capabilities.approve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Approve device" }));
  await screen.findByRole("button", { name: "Download artifact" });
  expect(request).toHaveBeenCalledTimes(2);
  expect(capabilities.approve).toHaveBeenCalledOnce();
});

it("requires a readable S3 location before requesting permission or approving", async () => {
  const capabilities = galleryDevices();
  const inspect = capabilities.inspect;
  capabilities.inspect = async (vaultId) => ({
    ...(await inspect(vaultId)),
    location: undefined,
  });
  capabilities.requestAccess = vi.fn(capabilities.requestAccess);
  capabilities.approve = vi.fn(capabilities.approve);
  render(
    <DeviceManagementView
      vaultId="gallery-vault"
      capabilities={capabilities}
      onOpenSync={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Approve a device" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Access request" }), {
    target: { value: "request" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Review access request" }),
  );
  fireEvent.click(
    await screen.findByRole("checkbox", {
      name: "The request fingerprint matches my new device.",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve device" }));
  await screen.findByText(/S3 location could not be read/);
  expect(capabilities.requestAccess).not.toHaveBeenCalled();
  expect(capabilities.approve).not.toHaveBeenCalled();
});
