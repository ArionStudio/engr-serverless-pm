// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
  for (const [label, value] of [
    ["Region", "eu-central-1"],
    ["Access key ID", "TESTKEY"],
    ["Secret access key", "test-secret"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Test access" }));
  fireEvent.click(screen.getByRole("button", { name: "Back to setup guide" }));
  expect(screen.queryByRole("tab", { name: "Use template" })).toBeNull();
  await waitFor(() =>
    expect(capabilities.test).toHaveBeenCalledWith(
      "gallery-vault",
      expect.objectContaining({ bucket: "tested-bucket" }),
    ),
  );
  await act(async () => finish());
  fireEvent.click(screen.getByRole("button", { name: "Back to setup guide" }));
  expect(screen.getByRole("tab", { name: "Use template" })).toBeTruthy();
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
    target: { value: "*" },
  });
  const continueSetup = screen.getByRole("button", {
    name: "I created this private bucket",
  });
  expect((continueSetup as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(continueSetup);
  expect(screen.queryByLabelText("Access key ID")).toBeNull();
  fireEvent.change(screen.getByLabelText("Vault object prefix"), {
    target: { value: "private/" },
  });
  for (const name of [
    "I created this private bucket",
    "I saved the HTTPS policy",
    "I attached the scoped policy to the user",
  ]) {
    fireEvent.click(screen.getByRole("button", { name }));
  }
  expect(
    screen.getByRole("heading", { name: "4. Connect vault" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("region", { name: "Storage location" }).textContent,
  ).toContain("chosen-vault");
  expect(
    screen.getByRole("region", { name: "Storage location" }).textContent,
  ).toContain("eu-west-1");
  expect(
    screen.getByRole("region", { name: "Storage location" }).textContent,
  ).toContain("private/");
  expect(
    (screen.getByLabelText("Secret access key") as HTMLInputElement).value,
  ).toBe("");
  expect(capabilities.test).not.toHaveBeenCalled();
  expect(capabilities.configure).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Secret access key"), {
    target: { value: "gallery-secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Edit storage" }));
  expect(screen.queryByLabelText("Secret access key")).toBeNull();
  expect(
    (screen.getByLabelText("S3 bucket name") as HTMLInputElement).value,
  ).toBe("chosen-vault");
  fireEvent.click(screen.getByRole("button", { name: "Connect vault" }));
  expect(screen.getAllByLabelText("Secret access key")).toHaveLength(1);
  expect(
    (screen.getByLabelText("Secret access key") as HTMLInputElement).value,
  ).toBe("gallery-secret");
  fireEvent.click(screen.getByRole("tab", { name: "Use template" }));
  expect(screen.queryByLabelText("Secret access key")).toBeNull();
});

it("shows required errors inline and tests only complete input beside the keys", async () => {
  const capabilities = gallerySync();
  capabilities.test = vi.fn().mockResolvedValue(undefined);
  capabilities.configure = vi.fn();
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
  fireEvent.click(screen.getByRole("button", { name: "Test access" }));
  expect(screen.getByText("Access key ID is required.")).toBeTruthy();
  expect(screen.getByText("Secret access key is required.")).toBeTruthy();
  expect(capabilities.test).not.toHaveBeenCalled();
  for (const [label, value] of [
    ["Bucket", "private-vault"],
    ["Region", "eu-central-1"],
    ["Access key ID", "EXAMPLEKEY"],
    ["Secret access key", "gallery-secret"],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Test access" }));
  await screen.findByText(/Read access confirmed/);
  expect(
    screen.getByRole("region", { name: "Access keys" }).textContent,
  ).toContain("Read access confirmed");
  expect(capabilities.configure).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Secret access key"), {
    target: { value: "changed" },
  });
  expect(screen.queryByText(/Read access confirmed/)).toBeNull();
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
  await waitFor(() =>
    expect(capabilities.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        vaultId: "gallery-vault",
        resolution: {
          entryResolutions: [],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ),
  );
  await screen.findByText("The encrypted vault is up to date in S3.");
});
