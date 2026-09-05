// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SetupPassword } from "./setup-password.view";
import type { AssessPassword } from "./setup.type";

afterEach(cleanup);
function Harness({
  assessPassword,
  onContinue = vi.fn(),
}: {
  assessPassword: AssessPassword;
  onContinue?: () => void;
}) {
  const [value, onChange] = useState({ password: "", confirmation: "" });
  return (
    <SetupPassword
      value={value}
      onChange={onChange}
      assessPassword={assessPassword}
      onContinue={onContinue}
      onBack={vi.fn()}
    />
  );
}
const passwordInput = () =>
  screen.getByLabelText("New password", { exact: true });
const confirmationInput = () =>
  screen.getByLabelText("Confirm password", { exact: true });

describe("password setup feedback", () => {
  it("requires a fresh assessment after clearing and reentering the same password", async () => {
    const user = userEvent.setup();
    let finish: (result: { score: 1 }) => void = () => {};
    const assess = vi
      .fn<AssessPassword>()
      .mockResolvedValueOnce({ score: 4 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    render(<Harness assessPassword={assess} />);
    await user.type(passwordInput(), "same password");
    await screen.findByText("Strong", { exact: true });
    await user.clear(passwordInput());
    await user.type(passwordInput(), "same password");
    await waitFor(() => expect(assess).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByText("Strong", { exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    finish({ score: 1 });
    await screen.findByText("Weak", { exact: true });
  });

  it("hides strength feedback until typing and removes it when the password is cleared", async () => {
    const user = userEvent.setup();
    render(<Harness assessPassword={async () => ({ score: 4 })} />);
    expect(
      screen.queryByRole("meter", { hidden: true }),
    ).not.toBeInTheDocument();
    await user.type(passwordInput(), "long password");
    await screen.findByRole("meter", { name: "Password strength" });
    await user.clear(passwordInput());
    expect(
      screen.queryByRole("meter", { hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Strong", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Checking password strength/),
    ).not.toBeInTheDocument();
  });
  it("keeps pending and failed assessments distinct from weak passwords, and retries without losing input", async () => {
    const user = userEvent.setup();
    let rejectAssessment: (reason: Error) => void = () => {};
    const assess = vi
      .fn<AssessPassword>()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectAssessment = reject;
          }),
      )
      .mockResolvedValue({ score: 4 });
    const next = vi.fn();
    render(<Harness assessPassword={assess} onContinue={next} />);
    await user.type(passwordInput(), "orbit lantern velvet canyon river");
    await user.type(confirmationInput(), "orbit lantern velvet canyon river");
    await waitFor(() => expect(assess).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(passwordInput()).not.toHaveAttribute("aria-invalid", "true");
    rejectAssessment(new Error("Unavailable"));
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText("Strong", { exact: true });
    expect(passwordInput()).toHaveValue("orbit lantern velvet canyon river");
    expect(confirmationInput()).toHaveValue(
      "orbit lantern velvet canyon river",
    );
    expect(next).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("retains password errors while confirmation is edited, validates confirmation on blur and reports a match", async () => {
    const user = userEvent.setup();
    const assess = vi.fn<AssessPassword>().mockResolvedValue({ score: 1 });
    render(<Harness assessPassword={assess} />);
    await user.type(passwordInput(), "weak");
    await screen.findByText("Weak", { exact: true });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Confirm your password.")).toBeInTheDocument();
    await user.type(confirmationInput(), "different");
    expect(passwordInput()).toHaveAttribute("aria-invalid", "true");
    await user.tab();
    expect(screen.getByText(/The passwords don’t match/)).toBeInTheDocument();
    await user.clear(confirmationInput());
    await user.type(confirmationInput(), "weak");
    expect(screen.getByText("Passwords match.")).toBeInTheDocument();
    expect(confirmationInput()).toHaveAttribute("aria-invalid", "false");
    expect(passwordInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("does not show mismatch errors while confirmation is first being typed and clears Caps Lock on blur", async () => {
    const user = userEvent.setup();
    render(<Harness assessPassword={async () => ({ score: 4 })} />);
    expect(
      screen.queryByRole("meter", { hidden: true }),
    ).not.toBeInTheDocument();
    await user.type(passwordInput(), "long password");
    fireEvent.keyDown(passwordInput(), { key: "A", modifierCapsLock: true });
    expect(screen.getByText("Caps Lock is on.")).toBeInTheDocument();
    await user.click(confirmationInput());
    expect(screen.queryByText("Caps Lock is on.")).not.toBeInTheDocument();
    await user.type(confirmationInput(), "partial");
    expect(
      screen.queryByText(/The passwords don’t match/),
    ).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByText(/The passwords don’t match/)).toBeInTheDocument();
  });

  it("ignores a stale accepted assessment after the password changes", async () => {
    const user = userEvent.setup();
    let acceptOld: (result: { score: 4 }) => void = () => {};
    const assess = vi
      .fn<AssessPassword>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            acceptOld = resolve;
          }),
      )
      .mockResolvedValue({ score: 1 });
    render(<Harness assessPassword={assess} />);
    await user.type(passwordInput(), "old password");
    await waitFor(() => expect(assess).toHaveBeenCalledTimes(1));
    await user.clear(passwordInput());
    await user.type(passwordInput(), "new");
    await screen.findByText("Weak", { exact: true });
    acceptOld({ score: 4 });
    await waitFor(() =>
      expect(
        screen.queryByText("Strong", { exact: true }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Weak", { exact: true })).toBeInTheDocument();
  });
});
