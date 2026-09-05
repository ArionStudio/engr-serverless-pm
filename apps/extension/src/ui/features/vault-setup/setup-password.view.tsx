import { useEffect, useMemo, useRef, useState } from "react";
import {
  PasswordCreationForm,
  type PasswordCreationDraft,
} from "./password-creation-form.view";
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
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(
    () => ({ hasPassword: !!value.password, attempt }),
    [value.password, attempt],
  );
  const [assessment, setAssessment] = useState<{
    request: typeof request;
    score?: 0 | 1 | 2 | 3 | 4;
    failed?: boolean;
  }>();
  const [submitted, setSubmitted] = useState(false);
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  useEffect(() => {
    if (!request.hasPassword) return;
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { score } = await assessPassword(value.password);
          if (active) setAssessment({ request, score });
        } catch {
          if (active) setAssessment({ request, failed: true });
        }
      })();
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value.password, assessPassword, request]);
  const current = assessment?.request === request;
  const score = value.password && current ? assessment.score : undefined;
  const strengthState = !value.password
    ? "ready"
    : !current
      ? "pending"
      : assessment.failed
        ? "unavailable"
        : "ready";
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
          if (next.password !== value.password) setAssessment(undefined);
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
        onRetryStrength={() => setAttempt((previous) => previous + 1)}
        score={score}
        strengthState={strengthState}
      />
    </div>
  );
}
