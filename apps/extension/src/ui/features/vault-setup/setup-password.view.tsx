import { useRef, useState } from "react";
import {
  PasswordCreationForm,
  type PasswordCreationDraft,
} from "./password-creation-form.view";
import { usePasswordAssessment } from "./use-password-assessment";
import type { AssessPassword } from "./setup.type";

export function SetupPassword({
  value,
  onChange,
  onContinue,
  onBack,
  assessPassword,
}: {
  value: PasswordCreationDraft;
  onChange: (value: PasswordCreationDraft) => void;
  onContinue: () => void;
  onBack: () => void;
  assessPassword: AssessPassword;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const { score, strengthState, invalidate, retry } = usePasswordAssessment(
    value.password,
    assessPassword,
  );
  const passwordError = !value.password
    ? "Enter a password."
    : strengthState === "ready" && score !== 4
      ? "Use a longer, less predictable password until its strength is Strong."
      : undefined;
  const confirmationError = !value.confirmation
    ? "Confirm your password."
    : value.password !== value.confirmation
      ? "The passwords don’t match. Type the same password again."
      : undefined;
  function submit() {
    setSubmitted(true);
    if (passwordError || confirmationError) {
      requestAnimationFrame(() =>
        host.current
          ?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')
          ?.focus(),
      );
    } else if (strengthState === "ready" && score === 4) onContinue();
  }
  return (
    <div ref={host} className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Vault password</h1>
      <PasswordCreationForm
        value={value}
        onChange={(next) => {
          if (next.password !== value.password) invalidate();
          onChange(next);
        }}
        onSubmit={submit}
        onCancel={onBack}
        errors={{
          password: submitted ? passwordError : undefined,
          confirmation:
            submitted || confirmationTouched ? confirmationError : undefined,
        }}
        onConfirmationBlur={() => setConfirmationTouched(true)}
        onRetryStrength={retry}
        score={score}
        strengthState={strengthState}
      />
    </div>
  );
}
