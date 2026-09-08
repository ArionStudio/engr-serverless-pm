import { useEffect, useRef, useState } from "react";
import type { SyncCapabilities, SyncLocation } from "./sync.type";

type AccessCapabilities = Pick<
  SyncCapabilities,
  "hasAccess" | "requestAccess" | "subscribe"
>;
type AccessState =
  | "checking"
  | "required"
  | "requesting"
  | "allowed"
  | "invalid"
  | "error";

function failure(error: unknown): "invalid" | "error" {
  return error instanceof Error && error.name === "InvalidStorageLocationError"
    ? "invalid"
    : "error";
}

export function useStorageAccess(
  location: SyncLocation,
  valid: boolean,
  capabilities: AccessCapabilities,
) {
  const key = JSON.stringify(location);
  const [result, setResult] = useState<{ key: string; state: AccessState }>({
    key,
    state: "checking",
  });
  const revision = useRef(0);
  const requesting = useRef(false);
  const { bucket, region, prefix } = location;
  useEffect(() => {
    const revisions = revision;
    let active = true;
    requesting.current = false;
    const target = { bucket, region, prefix };
    async function check() {
      if (requesting.current) return;
      const owner = ++revision.current;
      try {
        const allowed = valid && (await capabilities.hasAccess(target));
        if (active && owner === revision.current)
          setResult({ key, state: allowed ? "allowed" : "required" });
      } catch (error) {
        if (active && owner === revision.current)
          setResult({ key, state: failure(error) });
      }
    }
    void check();
    const unsubscribe = capabilities.subscribe((reason) => {
      if (reason === "permissions" || reason === "focus") void check();
    });
    return () => {
      active = false;
      ++revisions.current;
      unsubscribe();
    };
  }, [bucket, region, prefix, key, valid, capabilities]);

  async function allow() {
    if (!valid || requesting.current) return;
    requesting.current = true;
    const owner = ++revision.current;
    setResult({ key, state: "requesting" });
    try {
      // Preserve the click gesture: request before awaiting another operation.
      await capabilities.requestAccess({ bucket, region, prefix });
      const allowed = await capabilities.hasAccess({ bucket, region, prefix });
      if (owner === revision.current)
        setResult({ key, state: allowed ? "allowed" : "required" });
    } catch (error) {
      if (owner === revision.current) setResult({ key, state: failure(error) });
    } finally {
      if (owner === revision.current) requesting.current = false;
    }
  }
  return {
    state: result.key === key ? result.state : "checking",
    allow,
  };
}
