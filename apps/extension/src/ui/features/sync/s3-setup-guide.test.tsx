// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { S3SetupGuide } from "./s3-setup-guide.view";

afterEach(cleanup);
const next = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
function Guide() {
  const [location, setLocation] = useState({
    bucket: "",
    region: "",
    prefix: "vault/",
  });
  return (
    <S3SetupGuide
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
it("requires explicit confirmations, completed deployment and valid Outputs before access keys", () => {
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
it("retains each method's progress and invalidates policies when the storage location changes", () => {
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
  next("I created this private bucket");
  expect(
    (screen.getByLabelText("Bucket policy") as HTMLTextAreaElement).value,
  ).toContain("other-vault");
});
