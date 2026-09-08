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
import { SyncPage } from "./sync-page.view";

afterEach(cleanup);

it("keeps the tested location fixed until the access check finishes", async () => {
  const capabilities = gallerySync();
  let finish = () => {};
  capabilities.test = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <SyncPage
      vaultId="gallery-vault"
      capabilities={capabilities}
      onBack={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "I already have storage" }),
  );
  fireEvent.change(screen.getByLabelText("Bucket"), {
    target: { value: "tested-bucket" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Test access" }));
  fireEvent.click(
    screen.getByRole("button", { name: "S3 setup instructions" }),
  );
  expect(screen.queryByRole("region", { name: "S3 storage setup" })).toBeNull();
  expect(capabilities.test).toHaveBeenCalledWith(
    "gallery-vault",
    expect.objectContaining({ bucket: "tested-bucket" }),
  );
  await act(async () => finish());
  fireEvent.click(
    screen.getByRole("button", { name: "S3 setup instructions" }),
  );
  expect(screen.getByRole("region", { name: "S3 storage setup" })).toBeTruthy();
});

it("carries manual setup values into the connection form without contacting S3", async () => {
  const capabilities = gallerySync();
  capabilities.test = vi.fn();
  capabilities.configure = vi.fn();
  render(
    <SyncPage
      vaultId="gallery-vault"
      capabilities={capabilities}
      onBack={() => {}}
    />,
  );
  await screen.findByRole("region", { name: "S3 storage setup" });
  fireEvent.click(screen.getByRole("tab", { name: "AWS Console" }));
  fireEvent.change(screen.getByLabelText("S3 bucket name"), {
    target: { value: "chosen-vault" },
  });
  fireEvent.change(screen.getByLabelText("S3 region"), {
    target: { value: "eu-west-1" },
  });
  fireEvent.change(screen.getByLabelText("Vault object prefix"), {
    target: { value: "private/" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "5. Connect this vault" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Enter connection details" }),
  );
  expect((screen.getByLabelText("Bucket") as HTMLInputElement).value).toBe(
    "chosen-vault",
  );
  expect((screen.getByLabelText("Region") as HTMLInputElement).value).toBe(
    "eu-west-1",
  );
  expect(
    (screen.getByLabelText("Object prefix") as HTMLInputElement).value,
  ).toBe("private/");
  expect(
    (screen.getByLabelText("Secret access key") as HTMLInputElement).value,
  ).toBe("");
  expect(capabilities.test).not.toHaveBeenCalled();
  expect(capabilities.configure).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "S3 setup instructions" }),
  );
  fireEvent.click(screen.getByRole("tab", { name: "AWS Console" }));
  expect(
    (screen.getByLabelText("S3 bucket name") as HTMLInputElement).value,
  ).toBe("chosen-vault");
});

it("blocks invalid manual setup while preserving the existing-storage and template handoffs", async () => {
  render(
    <SyncPage
      vaultId="gallery-vault"
      capabilities={gallerySync()}
      onBack={() => {}}
    />,
  );
  await screen.findByRole("region", { name: "S3 storage setup" });
  fireEvent.click(screen.getByRole("tab", { name: "AWS Console" }));
  fireEvent.click(
    screen.getByRole("button", { name: "5. Connect this vault" }),
  );
  const connect = await screen.findByRole("button", {
    name: "Enter connection details",
  });
  expect((connect as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(connect);
  expect(screen.queryByLabelText("Access key ID")).toBeNull();
  fireEvent.change(screen.getByLabelText("S3 bucket name"), {
    target: { value: "safe-vault" },
  });
  fireEvent.change(screen.getByLabelText("Vault object prefix"), {
    target: { value: "*" },
  });
  expect((connect as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/In step 1, enter a prefix/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Vault object prefix"), {
    target: { value: "private/" },
  });
  expect((connect as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("Vault object prefix"), {
    target: { value: "" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "I already have storage" }),
  );
  expect(screen.getByLabelText("Access key ID")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "S3 setup instructions" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "3. Connect this vault" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Enter connection details" }),
  );
  expect(screen.getByLabelText("Access key ID")).toBeTruthy();
});

it("offers explicit acceptance for a verified newer revision with unchanged content", async () => {
  const capabilities = gallerySync("sync-revision");
  capabilities.apply = vi.fn(async () => ({ syncUpload: "complete" as const }));
  render(
    <SyncPage
      vaultId="gallery-vault"
      capabilities={capabilities}
      onBack={() => {}}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Check sync" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Accept remote revision" }),
  );
  expect(capabilities.apply).toHaveBeenCalledWith(
    expect.objectContaining({
      vaultId: "gallery-vault",
      resolution: {
        entryResolutions: [],
        tagResolutions: [],
        deviceProfileResolutions: [],
      },
    }),
  );
  await screen.findByText("The encrypted vault is up to date in S3.");
});
