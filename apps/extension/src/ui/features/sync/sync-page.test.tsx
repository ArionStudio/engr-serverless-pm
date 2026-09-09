// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { gallerySync } from "@/gallery/sync-fixture";
import type { SyncCapabilities } from "./sync.type";
import { SyncPage } from "./sync-page.view";

afterEach(cleanup);

it("presents an unknown browser permission as one retryable state", async () => {
  const capabilities = gallerySync("sync-configured");
  capabilities.hasAccess = vi.fn(async () => {
    throw new Error("Browser permission API unavailable");
  });
  capabilities.requestAccess = vi.fn(async () => {});

  render(
    <SyncPage
      vaultId="gallery-vault"
      capabilities={capabilities}
      onBack={() => {}}
    />,
  );

  const permissionError = await screen.findByRole("alert");
  expect(permissionError.textContent).toContain(
    "Storage access could not be checked",
  );
  expect(screen.queryByText("Storage access is needed")).toBeNull();
  expect(
    screen.getAllByRole("button", { name: "Allow storage access" }),
  ).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "Allow storage access" }));
  await waitFor(() =>
    expect(capabilities.requestAccess).toHaveBeenCalledOnce(),
  );
  await waitFor(() =>
    expect(
      screen.queryByText("Storage access could not be checked"),
    ).toBeNull(),
  );
});

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
  fireEvent.change(screen.getByRole("textbox", { name: "S3 bucket name" }), {
    target: { value: "tested-bucket" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "S3 region" }), {
    target: { value: "eu-central-1" },
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Continue to access keys" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Continue to access keys" }),
  );
  for (const [label, value] of [
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
  fireEvent.change(screen.getByRole("textbox", { name: "S3 bucket name" }), {
    target: { value: "chosen-vault" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "S3 region" }), {
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
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "I created this private bucket" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
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
    (
      screen.getByRole("textbox", {
        name: "S3 bucket name",
      }) as HTMLInputElement
    ).value,
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
  fireEvent.change(screen.getByRole("textbox", { name: "S3 bucket name" }), {
    target: { value: "private-vault" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "S3 region" }), {
    target: { value: "eu-central-1" },
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Continue to access keys" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Continue to access keys" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Test access" }));
  expect(screen.getByText("Access key ID is required.")).toBeTruthy();
  expect(screen.getByText("Secret access key is required.")).toBeTruthy();
  expect(capabilities.test).not.toHaveBeenCalled();
  for (const [label, value] of [
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

it("requires a separate action before using a newer verified S3 vault", async () => {
  const capabilities = gallerySync("sync-existing");
  capabilities.connectExisting = vi.fn(capabilities.connectExisting);
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
  fireEvent.change(screen.getByRole("textbox", { name: "S3 bucket name" }), {
    target: { value: "personal-vault" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "S3 region" }), {
    target: { value: "eu-central-1" },
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Continue to access keys" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Continue to access keys" }),
  );
  fireEvent.change(screen.getByLabelText("Access key ID"), {
    target: { value: "EXAMPLEKEY" },
  });
  fireEvent.change(screen.getByLabelText("Secret access key"), {
    target: { value: "gallery-secret" },
  });

  fireEvent.click(screen.getByRole("button", { name: "Enable sync" }));

  await screen.findByText("Existing vault found");
  expect(screen.getByText(/S3 contains a newer signed copy/)).toBeTruthy();
  const useRemote = screen.getByRole("button", {
    name: "Use newer vault from S3",
  });
  expect(capabilities.connectExisting).not.toHaveBeenCalled();
  fireEvent.click(useRemote);

  await screen.findByText("Vault is up to date");
  expect(capabilities.connectExisting).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText("Secret access key")).toBeNull();
});

it("redirects an occupied object path to prefix editing without clearing the keys", async () => {
  const capabilities = gallerySync();
  const occupied = new Error("private AWS response");
  occupied.name = "InvalidRemoteVaultSnapshotRecordError";
  capabilities.configure = vi
    .fn<SyncCapabilities["configure"]>()
    .mockRejectedValueOnce(occupied)
    .mockResolvedValueOnce({
      kind: "enabled",
      result: { syncUpload: "complete" },
    });
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
  fireEvent.change(screen.getByRole("textbox", { name: "S3 bucket name" }), {
    target: { value: "private-vault" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "S3 region" }), {
    target: { value: "eu-central-1" },
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Continue to access keys" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Continue to access keys" }),
  );
  fireEvent.change(screen.getByLabelText("Access key ID"), {
    target: { value: "EXAMPLEKEY" },
  });
  fireEvent.change(screen.getByLabelText("Secret access key"), {
    target: { value: "gallery-secret" },
  });

  fireEvent.click(screen.getByRole("button", { name: "Enable sync" }));

  const collision = await screen.findByRole("alert");
  expect(collision.textContent).toContain("Object path is already in use");
  expect(collision.textContent).toContain("vault/vault.enc");
  expect(collision.textContent).not.toContain("private AWS response");
  fireEvent.click(
    within(collision).getByRole("button", { name: "Change object prefix" }),
  );
  const prefix = screen
    .getAllByLabelText("Vault object prefix")
    .find((element) => !element.closest("[hidden]")) as HTMLInputElement;
  expect(prefix.value).toBe("vault/");
  fireEvent.change(prefix, { target: { value: "new-vault/" } });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Continue to access keys" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Continue to access keys" }),
  );
  expect(
    (screen.getByLabelText("Secret access key") as HTMLInputElement).value,
  ).toBe("gallery-secret");

  fireEvent.click(screen.getByRole("button", { name: "Enable sync" }));

  await waitFor(() => expect(capabilities.configure).toHaveBeenCalledTimes(2));
  expect(capabilities.configure).toHaveBeenLastCalledWith(
    "gallery-vault",
    expect.objectContaining({ prefix: "new-vault/" }),
  );
});

it("requires the data acknowledgment before disabling sync", async () => {
  const capabilities = gallerySync("sync-configured");
  capabilities.disable = vi.fn(async () => {});
  render(
    <SyncPage
      vaultId="gallery-vault"
      capabilities={capabilities}
      onBack={() => {}}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Disable sync" }));
  const dialog = screen.getByRole("alertdialog");
  const { getByRole, getByText } = within(dialog);
  const confirm = getByRole("button", {
    name: "Disable sync",
  }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  expect(dialog.textContent).toContain("other devices will lose access");
  fireEvent.click(
    getByText("I have saved the vault data I need on this device."),
  );
  expect(
    (
      getByRole("checkbox", {
        name: "I have saved the vault data I need on this device.",
      }) as HTMLElement
    ).getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(confirm);
  await screen.findByText("Sync is not configured");
  expect(capabilities.disable).toHaveBeenCalledTimes(1);
});

it("blocks disabling sync until previous credentials are revoked", async () => {
  const capabilities = gallerySync("sync-revocation-pending");
  capabilities.completeCredentialRevocation = vi.fn(async () => ({
    providerCredentialRevocation: "complete" as const,
    syncUpload: "complete" as const,
  }));
  render(
    <SyncPage
      vaultId="gallery-vault"
      capabilities={capabilities}
      onBack={() => {}}
    />,
  );
  expect(
    (
      (await screen.findByRole("button", {
        name: "Disable sync",
      })) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Verify old keys are revoked" }),
  );
  await screen.findByText(
    "Previous access keys can no longer access the vault. The updated vault is uploaded.",
  );
  expect(capabilities.completeCredentialRevocation).toHaveBeenCalledWith(
    "gallery-vault",
  );
});

it("requires replacement keys and explicit vault choices before accepting device revocation", async () => {
  const capabilities = gallerySync("sync-configured");
  capabilities.acceptRevocation = vi.fn(async () => ({
    syncUpload: "complete" as const,
  }));
  render(
    <SyncPage
      vaultId="gallery-vault"
      capabilities={capabilities}
      onBack={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Review removed devices" }),
  );
  const load = screen.getByRole("button", {
    name: "Load device changes",
  }) as HTMLButtonElement;
  expect(load.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Access key ID"), {
    target: { value: "EXAMPLEKEY" },
  });
  fireEvent.change(screen.getByLabelText("Secret access key"), {
    target: { value: "fixture-secret" },
  });
  fireEvent.click(load);
  await screen.findByText("old-phone");
  const apply = screen.getByRole("button", {
    name: "Apply reviewed choices",
  }) as HTMLButtonElement;
  expect(apply.disabled).toBe(true);
  expect(capabilities.acceptRevocation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Use remote"));
  fireEvent.click(apply);
  await screen.findByText("The encrypted vault is up to date in S3.");
  expect(capabilities.acceptRevocation).toHaveBeenCalledWith(
    expect.objectContaining({ vaultId: "gallery-vault" }),
    expect.objectContaining({
      accessKeyId: "EXAMPLEKEY",
      secretAccessKey: "fixture-secret",
    }),
  );
  expect(screen.queryByLabelText("Secret access key")).toBeNull();
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
          folderResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ),
  );
  await screen.findByText("The encrypted vault is up to date in S3.");
});
