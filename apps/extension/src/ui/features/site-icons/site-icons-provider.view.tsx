import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  SiteIconCapabilities,
  SiteIconPreference,
} from "./site-icons.type";
import { SiteIconsContext } from "./site-icons.context";

export function SiteIconsProvider({
  capabilities,
  children,
}: {
  capabilities: SiteIconCapabilities;
  children: ReactNode;
}) {
  const [preference, setPreference] = useState<SiteIconPreference>({
    supported: false,
    enabled: false,
    cleanupRequired: false,
  });
  const [reading, setReading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const pending = reading || mutating;
  const [error, setError] = useState<{
    message: string;
    cleanup?: boolean;
    read?: boolean;
  }>();
  const active = useRef(false);
  const busy = useRef(false);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    setReading(true);
    // Stop rendering icon URLs immediately when permissions or preferences change.
    setPreference((current) => ({ ...current, enabled: false }));
    try {
      const next = await capabilities.read();
      if (active.current && request === revision.current) {
        setPreference(next);
        setError(undefined);
        return { request, preference: next };
      }
    } catch {
      if (active.current && request === revision.current)
        setError({
          message:
            "Could not read website icon settings. Initials will be shown.",
          read: true,
        });
    } finally {
      if (active.current && request === revision.current) setReading(false);
    }
    return undefined;
  }, [capabilities]);
  useEffect(() => {
    active.current = true;
    const unsubscribe = capabilities.subscribe(() => {
      void refresh();
    });
    void refresh();
    return () => {
      active.current = false;
      unsubscribe();
    };
  }, [capabilities, refresh]);

  async function setEnabled(enabled: boolean) {
    if (busy.current) return;
    busy.current = true;
    setMutating(true);
    setError(undefined);
    try {
      await capabilities.setEnabled(enabled);
      await refresh();
    } catch (cause) {
      const current = await refresh();
      if (current && active.current && current.request === revision.current) {
        // Another context may already have committed the requested enable.
        if (
          enabled &&
          current.preference.enabled &&
          !current.preference.cleanupRequired
        )
          return;
        const cleanup =
          cause instanceof Error && cause.name === "SiteIconCleanupError";
        setError({
          message: cleanup
            ? "Website icon cleanup did not finish. Retry to turn off website icons and remove their browser permission."
            : cause instanceof Error &&
                cause.name === "SiteIconPermissionDeniedError"
              ? "Icon access was not allowed. Initials will still be shown."
              : "Could not change website icons. Try again.",
          cleanup,
        });
      }
    } finally {
      busy.current = false;
      if (active.current) setMutating(false);
    }
  }
  const cleanupRequired = error?.cleanup || preference.cleanupRequired;
  return (
    <SiteIconsContext
      value={{
        ...preference,
        pending,
        error:
          error?.message ??
          (preference.cleanupRequired
            ? "Website icons are off. Finish cleanup to clear their saved setting and browser permission."
            : undefined),
        retryCleanup: cleanupRequired
          ? () => {
              void setEnabled(false);
            }
          : undefined,
        retryRead: error?.read
          ? () => {
              void refresh();
            }
          : undefined,
        setEnabled: (enabled) => {
          void setEnabled(enabled);
        },
        source: (url) =>
          preference.enabled ? capabilities.source(url) : undefined,
      }}
    >
      {children}
    </SiteIconsContext>
  );
}
