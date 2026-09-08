import type { BrowserLoginCapabilities } from "@/ui/features/entries/browser-login.type";
export type BrowserLoginScenario =
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
  let enabled = false;
  let dismissed = false;
  return {
    read: async () => {
      if (scenario === "error") throw new Error("Could not read website.");
      return {
        target:
          scenario === "unavailable"
            ? null
            : {
                tabId: 1,
                url: "https://example.com/login",
                documentToken: "gallery",
                fillable: ![
                  "no-form",
                  "registration",
                  "password-change",
                ].includes(scenario),
                formToken: "gallery-form",
                form:
                  scenario === "no-form"
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
          scenario === "save" || scenario === "email-link-save"
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
          (scenario === "save" ||
            scenario === "email-link-save" ||
            scenario === "update")
            ? {
                id: "capture-1",
                tabId: 1,
                url: "https://example.com/login",
                login: "alex@example.com",
                password:
                  scenario === "email-link-save" ? "" : "Gallery-example-7!",
                expiresAt: Date.now() + 120000,
              }
            : null,
        updateEntryIds: scenario === "update" ? ["entry-1"] : [],
      };
    },
    fill: async () => {},
    dismiss: async () => {
      dismissed = true;
    },
    detectionEnabled: async () => enabled,
    setDetection: async (value) => {
      enabled = value;
    },
  };
}
