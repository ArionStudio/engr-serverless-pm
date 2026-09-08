import type { BrowserLoginCapabilities } from "@/ui/features/entries/browser-login.type";
import type { BrowserLogins } from "@lfspm/core";
export type BrowserLoginScenario =
  | "authorization-lost"
  | "detection-refresh-error"
  | "detection-stale-read-refresh-error"
  | "detection-disable-cleanup-error"
  | "retention-change-error"
  | "session-redirect"
  | "email-link-save"
  | "identifier"
  | "registration"
  | "password-change"
  | "matching"
  | "save"
  | "update"
  | "no-form"
  | "unavailable"
  | "error";
export function galleryBrowserLogins(
  scenario: BrowserLoginScenario = "matching",
): BrowserLoginCapabilities {
  let enabled = [
    "session-redirect",
    "detection-stale-read-refresh-error",
    "detection-disable-cleanup-error",
    "retention-change-error",
  ].includes(scenario);
  let retention = ["session-redirect", "retention-change-error"].includes(
    scenario,
  );
  let dismissed = false;
  let refreshFails = false;
  let retentionReadFails = false;
  let pendingInitialRead:
    | {
        readonly result: BrowserLogins;
        readonly resolve: (result: BrowserLogins) => void;
      }
    | undefined;
  return {
    inspectAuthorization: async () => {
      if (scenario === "authorization-lost")
        throw new Error("Vault authorization unavailable");
    },
    read: async () => {
      if (refreshFails) throw new Error("Active tab refresh failed");
      if (scenario === "authorization-lost")
        throw new Error("Website login read failed");
      if (scenario === "error") throw new Error("Could not read website.");
      const result: BrowserLogins = {
        target:
          scenario === "unavailable"
            ? null
            : {
                tabId: 1,
                url:
                  scenario === "session-redirect"
                    ? "https://account.example.org/home"
                    : "https://example.com/login",
                documentToken: "gallery",
                fillable: ![
                  "no-form",
                  "session-redirect",
                  "registration",
                  "password-change",
                ].includes(scenario),
                formToken: "gallery-form",
                form:
                  scenario === "no-form" || scenario === "session-redirect"
                    ? null
                    : {
                        kind:
                          scenario === "email-link-save"
                            ? "identifier"
                            : scenario === "identifier" ||
                                scenario === "registration" ||
                                scenario === "password-change"
                              ? scenario
                              : "sign-in",
                        fields:
                          scenario === "identifier" ||
                          scenario === "email-link-save"
                            ? ["email"]
                            : scenario === "registration"
                              ? ["email", "new-password", "confirm-password"]
                              : scenario === "password-change"
                                ? ["current-password", "new-password"]
                                : ["email", "current-password"],
                      },
              },
        entries:
          scenario === "session-redirect" ||
          scenario === "detection-stale-read-refresh-error" ||
          scenario === "save" ||
          scenario === "email-link-save"
            ? []
            : [
                {
                  id: "entry-1",
                  login: "alex@example.com",
                  url: "https://example.com/login",
                },
              ],
        captured:
          !dismissed &&
          (scenario === "session-redirect" ||
            scenario === "detection-stale-read-refresh-error" ||
            scenario === "save" ||
            scenario === "email-link-save" ||
            scenario === "update")
            ? {
                id: "capture-1",
                tabId: 1,
                url: "https://example.com/login",
                login: "alex@example.com",
                password:
                  scenario === "email-link-save" ? "" : "Gallery-example-7!",
                expiresAt:
                  scenario === "session-redirect" ? null : Date.now() + 120000,
              }
            : null,
        updateEntryIds: scenario === "update" ? ["entry-1"] : [],
      };
      if (scenario === "detection-stale-read-refresh-error") {
        if (pendingInitialRead === undefined)
          return new Promise<BrowserLogins>((resolve) => {
            pendingInitialRead = { result, resolve };
          });
        // Release the held initial result only after the replacement read starts.
        const pending = pendingInitialRead;
        pending.resolve(pending.result);
        throw new Error("Active tab refresh failed");
      }
      return result;
    },
    fill: async () => {},
    dismiss: async () => {
      dismissed = true;
    },
    sessionRetentionEnabled: async () => {
      if (retentionReadFails) throw new Error("Preference read failed");
      return retention;
    },
    setSessionRetention: async (value) => {
      if (scenario === "retention-change-error") {
        retentionReadFails = true;
        throw new Error("Detected login cleanup failed");
      }
      retention = value;
      if (!value) dismissed = true;
    },
    detectionEnabled: async () => enabled,
    setDetection: async (value) => {
      enabled = value;
      if (!value) dismissed = true;
      if (scenario === "detection-refresh-error") refreshFails = true;
      if (scenario === "detection-disable-cleanup-error")
        throw new Error("Website cleanup failed");
    },
  };
}
