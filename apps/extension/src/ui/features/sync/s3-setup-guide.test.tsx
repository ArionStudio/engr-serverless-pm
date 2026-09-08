// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { S3SetupGuide } from "./s3-setup-guide.view";
import { gallerySync } from "@/gallery/sync-fixture";
import { s3PermissionOrigin } from "../../../adapters/sync/browser-s3-access.adapter";

afterEach(cleanup);
const next = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const defaultAccess = gallerySync();
function Guide({ access = defaultAccess } = {}) {
  const [location, setLocation] = useState({
    bucket: "",
    region: "",
    prefix: "vault/",
  });
  return (
    <S3SetupGuide
      access={access}
      location={location}
      onLocationChange={setLocation}
      onCopy={vi.fn().mockResolvedValue(undefined)}
      connection={() => <div>Connection form</div>}
    />
  );
}
function deployment() {
  next("I uploaded the template");
  next("I entered the parameters");
  next("I submitted the stack");
}
function location() {
  fireEvent.change(screen.getByRole("textbox", { name: "S3 bucket name" }), {
    target: { value: "private-vault" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "S3 region" }), {
    target: { value: "eu-central-1" },
  });
}
it("requires explicit confirmations, completed deployment and valid Outputs before access keys", async () => {
  render(<Guide />);
  expect(
    screen
      .getByRole("button", { name: "Record Outputs" })
      .hasAttribute("disabled"),
  ).toBe(true);
  deployment();
  expect(
    screen
      .getByRole("button", { name: "Stack shows CREATE_COMPLETE" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Status shown in CloudFormation"), {
    target: { value: "failed" },
  });
  expect(
    screen.getByRole("note", { name: /Warning:.*Deployment needs attention/ })
      .textContent,
  ).toContain("Status reason");
  expect(
    screen
      .getByRole("button", { name: "Stack shows CREATE_COMPLETE" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Status shown in CloudFormation"), {
    target: { value: "complete" },
  });
  next("Stack shows CREATE_COMPLETE");
  expect(
    screen
      .getByRole("button", { name: "I copied the stack Outputs" })
      .hasAttribute("disabled"),
  ).toBe(true);
  location();
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "I copied the stack Outputs" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  next("I copied the stack Outputs");
  expect(
    screen.getByRole("heading", { name: "6. Connect vault" }),
  ).toBeTruthy();
  expect(document.activeElement?.textContent).toBe("6. Connect vault");
  next("Check stack status, confirmed");
  fireEvent.change(screen.getByLabelText("Status shown in CloudFormation"), {
    target: { value: "failed" },
  });
  expect(
    screen
      .getByRole("button", { name: "Connect vault" })
      .hasAttribute("disabled"),
  ).toBe(true);
});
it("retains each method's progress and invalidates policies when the storage location changes", async () => {
  render(<Guide />);
  next("I uploaded the template");
  fireEvent.click(screen.getByRole("tab", { name: "AWS Console" }));
  location();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Vault object prefix" }),
    { target: { value: "private//vault/" } },
  );
  expect(
    screen
      .getByRole("button", { name: "I created this private bucket" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByText(/end with \/ and use single \/ separators/),
  ).toBeTruthy();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Vault object prefix" }),
    { target: { value: "vault/" } },
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "I created this private bucket" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  next("I created this private bucket");
  expect(screen.getByLabelText("Bucket policy")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Use template" }));
  expect(
    screen.getByRole("heading", { name: "2. Set parameters" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "AWS Console" }));
  next("Previous step");
  fireEvent.change(screen.getByRole("textbox", { name: "S3 bucket name" }), {
    target: { value: "other-vault" },
  });
  expect(
    screen
      .getByRole("button", { name: "Require HTTPS" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "I created this private bucket" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  next("I created this private bucket");
  expect(
    (screen.getByLabelText("Bucket policy") as HTMLTextAreaElement).value,
  ).toContain("other-vault");
});

it("gates existing-storage credentials on permission and rejects a stale grant for another bucket", async () => {
  const access = gallerySync();
  const granted = new Set<string>();
  access.hasAccess = vi.fn(async (target) => {
    s3PermissionOrigin(target);
    return granted.has(target.bucket);
  });
  let finish: () => void = () => {};
  access.requestAccess = vi
    .fn()
    .mockRejectedValueOnce(new Error("Permission denied"))
    .mockImplementationOnce(
      (target) =>
        new Promise<void>((resolve) => {
          finish = () => {
            granted.add(target.bucket);
            resolve();
          };
        }),
    )
    .mockImplementation(async (target) => {
      granted.add(target.bucket);
    });
  let notify: () => void = () => {};
  access.subscribe = (listener) => {
    notify = () => listener("permissions");
    return () => {};
  };
  render(<Guide access={access} />);
  next("I already have storage");
  location();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Vault object prefix" }),
    { target: { value: "../" } },
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Check the bucket name, region and object prefix",
  );
  expect(
    screen
      .getByRole("button", { name: "Allow storage access" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(access.requestAccess).not.toHaveBeenCalled();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Vault object prefix" }),
    { target: { value: "vault/" } },
  );
  const proceed = () =>
    screen.getByRole("button", { name: "Continue to access keys" });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Allow storage access" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(proceed().hasAttribute("disabled")).toBe(true);
  expect(screen.queryByText("Connection form")).toBeNull();
  next("Allow storage access");
  await screen.findByRole("alert");
  expect(proceed().hasAttribute("disabled")).toBe(true);
  next("Allow storage access");
  expect(
    screen
      .getByRole("button", { name: "Requesting access…" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "S3 bucket name" }), {
    target: { value: "other.vault" },
  });
  await act(async () => finish());
  expect(proceed().hasAttribute("disabled")).toBe(true);
  next("Allow storage access");
  await waitFor(() => expect(proceed().hasAttribute("disabled")).toBe(false));
  expect(access.requestAccess).toHaveBeenLastCalledWith({
    bucket: "other.vault",
    region: "eu-central-1",
    prefix: "vault/",
  });
  next("Continue to access keys");
  expect(screen.getByText("Connection form")).toBeTruthy();
  await act(async () => {
    granted.clear();
    notify();
  });
  expect(screen.queryByText("Connection form")).toBeNull();
  expect(proceed().hasAttribute("disabled")).toBe(true);
});
