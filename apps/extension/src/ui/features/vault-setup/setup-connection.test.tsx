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
import { SetupConnection } from "./setup-connection.view";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("existing vault connection", () => {
  it("resumes a saved request from its approval and keeps password visibility separate from access keys", async () => {
    const enroll = vi.fn(async () => {});
    const capabilities = galleryDevices();
    const request = vi.fn(async () => true);
    const access = new BrowserS3AccessAdapter({
      request,
      contains: vi.fn(async () => true),
    });
    capabilities.requestAccess = (location) => access.request(location);
    render(
      <SetupConnection
        onBack={() => {}}
        capabilities={capabilities}
        assessPassword={async () => ({ score: 4 })}
        generatePassword={async () => ({
          password: "Generated-river-8!Pine-sky",
        })}
        onEnroll={enroll}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "I already have an approval" }),
    );
    expect(
      screen
        .getByRole("button", { name: /4\. Approval.*Current step/ })
        .getAttribute("aria-current"),
    ).toBe("step");
    const password = screen.getByLabelText("Password for this browser");
    fireEvent.change(password, { target: { value: "device-password" } });
    fireEvent.change(screen.getByLabelText("Device approval"), {
      target: { value: "approval" },
    });
    expect(screen.queryByLabelText("Secret access key")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Verify approval" }));
    const secret = await screen.findByLabelText("Secret access key");
    expect(screen.getByText("personal-vault")).toBeDefined();
    expect(screen.getByText("Verification passed.")).toBeDefined();
    expect(screen.queryByRole("textbox", { name: "Bucket" })).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(enroll).not.toHaveBeenCalled();
    fireEvent.change(secret, { target: { value: "device-secret" } });
    fireEvent.change(screen.getByLabelText("Access key ID"), {
      target: { value: "device-key" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Show password for this browser",
      }),
    );
    expect(password.getAttribute("type")).toBe("text");
    expect(secret.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Connect vault" }));
    // Permission must be requested synchronously from the user's click in Firefox.
    expect(request).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(enroll).toHaveBeenCalledWith({
        approval: "approval",
        password: "device-password",
        deviceName: "This browser",
        duration: 600_000,
        credentials: {
          bucket: "personal-vault",
          region: "eu-central-1",
          prefix: "vault/",
          accessKeyId: "device-key",
          secretAccessKey: "device-secret",
        },
      }),
    );
    expect(request).toHaveBeenCalledWith({
      origins: ["https://personal-vault.s3.eu-central-1.amazonaws.com/*"],
    });
    fireEvent.change(password, { target: { value: "different password" } });
    expect(screen.queryByLabelText("Secret access key")).toBeNull();
    expect(screen.queryByText("personal-vault")).toBeNull();
    capabilities.readApproval = async () => {
      throw new Error("Invalid approval");
    };
    fireEvent.click(screen.getByRole("button", { name: "Verify approval" }));
    await screen.findByText(/Could not verify this approval/);
    expect(screen.queryByLabelText("Secret access key")).toBeNull();
    expect(enroll).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
  });
  it("clears an old approval as soon as a replacement file is selected, including read failure", async () => {
    const enroll = vi.fn(async () => {});
    render(
      <SetupConnection
        onBack={() => {}}
        capabilities={galleryDevices()}
        assessPassword={async () => ({ score: 4 })}
        generatePassword={async () => ({
          password: "Generated-river-8!Pine-sky",
        })}
        onEnroll={enroll}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "I already have an approval" }),
    );
    fireEvent.change(screen.getByLabelText("Password for this browser"), {
      target: { value: "password" },
    });
    fireEvent.change(screen.getByLabelText("Device approval"), {
      target: { value: "old approval" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify approval" }));
    await screen.findByLabelText("Secret access key");
    let reject!: (error: Error) => void;
    const file = new File(["replacement"], "approval.json");
    Object.defineProperty(file, "text", {
      value: () =>
        new Promise<string>((_resolve, fail) => {
          reject = fail;
        }),
    });
    fireEvent.change(screen.getByLabelText("Choose approval file"), {
      target: { files: [file] },
    });
    expect(
      (screen.getByLabelText("Device approval") as HTMLTextAreaElement).value,
    ).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Verifying…" }));
    expect(enroll).not.toHaveBeenCalled();
    await act(async () => reject(new Error("unreadable")));
    await screen.findByText("Could not read this file.");
    expect(
      screen
        .getByRole("button", { name: "Verify approval" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("does not enroll after a session invalidation while an approval is being read", async () => {
    const capabilities = galleryDevices();
    let invalidate = () => {};
    capabilities.subscribe = (listener) => {
      invalidate = listener;
      return () => {};
    };
    let resolve:
      | ((value: Awaited<ReturnType<typeof capabilities.readApproval>>) => void)
      | undefined;
    capabilities.readApproval = () =>
      new Promise((done) => {
        resolve = done;
      });
    const enroll = vi.fn(async () => {});
    render(
      <SetupConnection
        onBack={() => {}}
        capabilities={capabilities}
        assessPassword={async () => ({ score: 4 })}
        generatePassword={async () => ({
          password: "Generated-river-8!Pine-sky",
        })}
        onEnroll={enroll}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "I already have an approval" }),
    );
    fireEvent.change(screen.getByLabelText("Password for this browser"), {
      target: { value: "device-password" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Device approval" }), {
      target: { value: "approval" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify approval" }));
    await waitFor(() => expect(resolve).toBeDefined());
    act(invalidate);
    await act(async () =>
      resolve?.({
        vaultId: "vault",
        requestId: "request",
        location: {
          bucket: "personal-vault",
          region: "eu-central-1",
          prefix: "vault/",
        },
      }),
    );
    expect(enroll).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("button", { name: "Continue to browser password" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.queryByDisplayValue("device-password")).toBeNull();
  });
});
