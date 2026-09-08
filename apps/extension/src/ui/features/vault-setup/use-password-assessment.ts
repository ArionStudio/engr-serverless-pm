import { useEffect, useMemo, useState } from "react";
import type { AssessPassword } from "./setup.type";
export function usePasswordAssessment(
  password: string,
  assessPassword: AssessPassword,
) {
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(
    () => ({ hasPassword: !!password, attempt }),
    [password, attempt],
  );
  const [assessment, setAssessment] = useState<{
    request: typeof request;
    score?: 0 | 1 | 2 | 3 | 4;
    failed?: boolean;
  }>();
  useEffect(() => {
    if (!request.hasPassword) return;
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { score } = await assessPassword(password);
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
  }, [password, assessPassword, request]);
  const current = assessment?.request === request;
  const score = password && current ? assessment.score : undefined;
  const strengthState = !password
    ? "ready"
    : !current
      ? "pending"
      : assessment.failed
        ? "unavailable"
        : "ready";
  return {
    score,
    strengthState,
    invalidate: () => setAssessment(undefined),
    retry: () => setAttempt((previous) => previous + 1),
  } as const;
}
