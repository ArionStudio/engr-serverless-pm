import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FormActions, PasswordField } from "./fields.view";
import { ActionFeedback } from "../feedback/action-feedback.view";
import type { OperationState } from "./form-state.type";
export function FormFrame({
  children,
  actions,
  onSubmit,
  onCancel,
  state = "idle",
  message,
  label = "Save",
  canSubmit = true,
  noValidate = false,
}: {
  children: ReactNode;
  actions?: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  state?: OperationState;
  message?: string;
  label?: string;
  canSubmit?: boolean;
  noValidate?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [submission, setSubmission] = useState(0);
  useLayoutEffect(() => {
    if (!submission) return;
    const invalid = form.current?.querySelector<HTMLElement>(
      'input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"], button[aria-invalid="true"], [role="combobox"][aria-invalid="true"]',
    );
    if (!invalid) return;
    invalid.focus({ preventScroll: true });
    invalid
      .closest('[data-slot="field"]')
      ?.scrollIntoView?.({ block: "center", behavior: "instant" });
  }, [submission]);
  return (
    <form
      ref={form}
      noValidate={noValidate}
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (state !== "pending" && canSubmit) {
          onSubmit();
          setSubmission((value) => value + 1);
        }
      }}
    >
      <fieldset disabled={state === "pending"} className="min-w-0 space-y-5">
        {children}
      </fieldset>
      <ActionFeedback state={state} message={message} />
      {actions ?? (
        <FormActions
          disabled={!canSubmit}
          pending={state === "pending"}
          onCancel={onCancel}
          label={label}
        />
      )}
    </form>
  );
}
// Reveal is transient view state. The owner remounts this field on lock/reset.
export function FormPassword(
  props: Omit<
    Parameters<typeof PasswordField>[0],
    "revealed" | "onRevealChange"
  >,
) {
  const [revealed, setRevealed] = useState(false);
  return (
    <PasswordField
      {...props}
      revealed={revealed}
      onRevealChange={setRevealed}
    />
  );
}
