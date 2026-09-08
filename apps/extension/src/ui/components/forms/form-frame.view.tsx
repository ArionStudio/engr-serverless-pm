import { useState, type ReactNode } from "react";
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
  return (
    <form
      noValidate={noValidate}
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (state !== "pending" && canSubmit) onSubmit();
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
