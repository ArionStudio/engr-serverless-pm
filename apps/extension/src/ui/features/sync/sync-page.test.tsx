// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { gallerySync } from "@/gallery/sync-fixture";
import { SyncPage } from "./sync-page.view";

afterEach(cleanup);

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
