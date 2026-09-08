import { useMemo, useState } from "react";
import { SiteIconsProvider } from "@/ui/features/site-icons/site-icons-provider.view";
import { SiteIconSettings } from "@/ui/features/site-icons/site-icon-settings.view";
import { SiteIconsContext } from "@/ui/features/site-icons/site-icons.context";
import { SiteIcon } from "@/ui/features/entries/site-icon.view";
import { Scenario } from "./specimen.view";
import iconUrl from "../../assets/icon.svg?url&no-inline";

export function SiteIconsExample() {
  return (
    <Scenario
      label="Browser icon setting"
      options={
        [
          "off",
          "on",
          "denied",
          "cleanup-failed",
          "read-failed",
          "unsupported",
          "pending",
        ] as const
      }
    >
      {(scenario) => <SiteIconsFixture key={scenario} scenario={scenario} />}
    </Scenario>
  );
}
function SiteIconsFixture({
  scenario,
}: {
  scenario:
    | "off"
    | "on"
    | "denied"
    | "cleanup-failed"
    | "read-failed"
    | "unsupported"
    | "pending";
}) {
  const [enabled, setEnabled] = useState(scenario === "on");
  const [cleanupFailed, setCleanupFailed] = useState(
    scenario === "cleanup-failed",
  );
  const [readFailed, setReadFailed] = useState(scenario === "read-failed");
  const [denied, setDenied] = useState(scenario === "denied");
  const capabilities = useMemo(
    () => ({
      read: async () => ({
        supported: true,
        enabled: false,
        cleanupRequired: false,
      }),
      setEnabled: async () => {},
      subscribe: () => () => {},
      source: () => iconUrl,
    }),
    [],
  );
  return (
    <SiteIconsProvider capabilities={capabilities}>
      <SiteIconsContext
        value={{
          supported: scenario !== "unsupported" && !readFailed,
          enabled,
          cleanupRequired: cleanupFailed,
          pending: scenario === "pending",
          error: readFailed
            ? "Could not read website icon settings. Initials will be shown."
            : cleanupFailed
              ? "Website icons are off. Finish cleanup to clear their saved setting and browser permission."
              : denied
                ? "Icon access was not allowed. Initials will still be shown."
                : undefined,
          retryCleanup: cleanupFailed
            ? () => {
                setEnabled(false);
                setCleanupFailed(false);
              }
            : undefined,
          retryRead: readFailed ? () => setReadFailed(false) : undefined,
          setEnabled: (next) => {
            setEnabled(next);
            setDenied(false);
            setCleanupFailed(false);
          },
          source: () => (enabled ? iconUrl : undefined),
        }}
      >
        <div className="max-w-xl space-y-5 rounded-xl border bg-card p-5">
          <SiteIconSettings />
          <div className="flex items-center gap-3">
            <SiteIcon url="https://mail.example.test/account" />
            <span>mail.example.test</span>
          </div>
        </div>
      </SiteIconsContext>
    </SiteIconsProvider>
  );
}
