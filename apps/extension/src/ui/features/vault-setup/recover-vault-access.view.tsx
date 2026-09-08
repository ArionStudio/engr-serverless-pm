import { useEffect, useRef, useState } from "react";
import {
  LocalRecoveryForm,
  type LocalRecoveryDraft,
} from "../recovery/local-recovery-form.view";
import { parseRecoveryPhrase } from "../recovery/parse-recovery-phrase";
import { usePasswordAssessment } from "./use-password-assessment";
import type { AssessPassword } from "./setup.type";

export function RecoverVaultAccess({
  vaultName,
  pending,
  error,
  assessPassword,
  onRecover,
  onBack,
}: {
  vaultName: string;
  pending: boolean;
  error?: string;
  assessPassword: AssessPassword;
  onRecover: (words: readonly string[], password: string) => void;
  onBack: () => void;
}) {
  const host = useRef<HTMLElement>(null);
  const [value, setValue] = useState<LocalRecoveryDraft>({
    phrase: "",
    password: "",
    confirmation: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const { score, strengthState, invalidate, retry } = usePasswordAssessment(
    value.password,
    assessPassword,
  );
  useEffect(() => {
    host.current?.focus();
  }, []);
  const words = parseRecoveryPhrase(value.phrase);
  const errors = {
    phrase: !words
      ? "Enter all 24 recovery words in order. Numbered lists must run from 1 to 24."
      : undefined,
    password: !value.password
      ? "Enter a new password."
      : strengthState === "ready" && score !== 4
        ? "Use a longer, less predictable password until its strength is Strong."
        : undefined,
    confirmation: !value.confirmation
      ? "Confirm your new password."
      : value.confirmation !== value.password
        ? "The passwords don’t match."
        : undefined,
  };
  function submit() {
    if (pending) return;
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) {
      requestAnimationFrame(() =>
        host.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
    } else if (words && strengthState === "ready" && score === 4)
      onRecover(words, value.password);
  }
  return (
    <section
      ref={host}
      tabIndex={-1}
      data-focus-target
      className="space-y-6 outline-none"
    >
      <h1 className="text-2xl font-semibold tracking-tight">
        Recover vault access
      </h1>
      <LocalRecoveryForm
        value={value}
        onChange={(next) => {
          if (next.password !== value.password) invalidate();
          setValue(next);
        }}
        errors={submitted ? errors : undefined}
        vaultSelector={<p className="font-medium">{vaultName}</p>}
        localDataAvailable
        state={pending ? "pending" : error ? "error" : "idle"}
        message={error}
        score={score}
        strengthState={strengthState}
        onRetryStrength={retry}
        onSubmit={submit}
        onCancel={onBack}
      />
    </section>
  );
}
