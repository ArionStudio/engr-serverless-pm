import { useEffect, useRef } from "react";

export function useOperationErrorFocus(error?: string) {
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView?.({ block: "center", behavior: "auto" });
  }, [error]);

  return errorRef;
}
