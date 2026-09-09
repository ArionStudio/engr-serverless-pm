import { useState, useSyncExternalStore } from "react";
import { useTheme } from "@/ui/features/theme";
import { OptionsExample, type OptionsScenario } from "./screen-examples.view";
import { PopupView } from "@/ui/entrypoints/popup/popup.view";
import { Button } from "@/ui/components/primitives/button";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
import { ReviewPageNavigation } from "./review-page-navigation.view";
import { cn } from "@/ui/lib/cn.util";

const screens: readonly {
  id: string;
  name: string;
  group: "Popup" | "Daily use" | "Sync and devices" | "Setup and recovery";
  states: readonly { id: OptionsScenario; label: string }[];
}[] = [
  {
    id: "application",
    name: "Application",
    group: "Daily use",
    states: [{ id: "application", label: "Full navigation" }],
  },
  {
    id: "tools",
    name: "Password tools",
    group: "Daily use",
    states: [
      { id: "tools", label: "Ready" },
      { id: "tools-pending", label: "Generation pending" },
      { id: "tools-error", label: "Generation error" },
    ],
  },
  {
    id: "devices",
    name: "Devices",
    group: "Sync and devices",
    states: [
      { id: "devices-sync-required", label: "Devices: sync required" },
      { id: "devices", label: "Manage and approve" },
      { id: "devices-error", label: "Read error" },
      {
        id: "devices-permission-denied",
        label: "Approval needs storage permission",
      },
      {
        id: "devices-revocation-error",
        label: "Revocation: reused access keys",
      },
      {
        id: "devices-refresh-error",
        label: "Read retry after approval or revocation",
      },
      { id: "devices-authorization-lost", label: "Authorization lost" },
    ],
  },
  {
    id: "tags",
    name: "Tags",
    group: "Daily use",
    states: [
      { id: "tags", label: "Manage tags" },
      { id: "tags-empty", label: "Empty vault" },
      { id: "tags-loading", label: "Loading" },
      { id: "tags-error", label: "Read error" },
      { id: "tags-live-groups", label: "Saved group details" },
      { id: "tags-mutation-error", label: "Cancel after save error" },
      { id: "tags-read-retry", label: "Recovered read" },
      { id: "tags-authorization-lost", label: "Authorization lost" },
    ],
  },
  {
    id: "vault-settings",
    name: "Vault settings",
    group: "Daily use",
    states: [
      { id: "settings-ready", label: "Ready" },
      { id: "settings-save-pending", label: "Save pending" },
      { id: "settings-save-error", label: "Save error" },
      { id: "settings-deletion-error", label: "Deletion error" },
      { id: "settings-authorization-lost", label: "Authorization lost" },
    ],
  },
  {
    id: "trust",
    name: "Device sync",
    group: "Sync and devices",
    states: [
      { id: "trust-enrollment", label: "Check added device" },
      { id: "trust-revocation", label: "Replacement keys" },
      { id: "trust-review-enrollment", label: "Review added device" },
      { id: "trust-review-revocation", label: "Review removed device" },
      { id: "trust-applying", label: "Applying" },
      { id: "trust-error", label: "Error" },
    ],
  },
  {
    id: "workspace",
    name: "Entries",
    group: "Daily use",
    states: [
      { id: "workspace", label: "Ready" },
      { id: "workspace-empty", label: "Empty vault" },
      { id: "workspace-loading", label: "Loading" },
      { id: "workspace-error", label: "Read error" },
      { id: "workspace-reveal-error", label: "Reveal error" },
      {
        id: "workspace-inline-refresh-error",
        label: "Inline save, reload failed",
      },
      { id: "workspace-stale", label: "Stale edit" },
      { id: "workspace-uploaded", label: "Saved and uploaded" },
      { id: "workspace-pending-upload", label: "Pending upload" },
      { id: "workspace-saved-refresh-error", label: "Saved, reload failed" },
    ],
  },
  {
    id: "s3-setup",
    name: "Set up S3",
    group: "Sync and devices",
    states: [
      { id: "s3-guide", label: "Instructions" },
      { id: "s3-copy-error", label: "Copy error" },
      { id: "s3-invalid-bucket", label: "Invalid bucket" },
      { id: "s3-invalid-prefix", label: "Invalid prefix" },
      { id: "s3-access-required", label: "Browser access required" },
      { id: "s3-access-error", label: "Browser access denied" },
      { id: "s3-access-pending", label: "Browser permission prompt open" },
      { id: "s3-access-invalid", label: "Invalid storage location" },
    ],
  },
  {
    id: "sync",
    name: "Sync",
    group: "Sync and devices",
    states: [
      { id: "sync-setup", label: "Set up" },
      { id: "sync-access-pending", label: "Pending access check" },
      {
        id: "sync-saved-refresh-error",
        label: "Saved, configuration refresh failed",
      },
      { id: "sync-existing", label: "Existing vault found" },
      { id: "sync-configured", label: "Configured" },
      { id: "sync-copy-session-lost", label: "Session ends before key copy" },
      { id: "sync-revocation-pending", label: "Old keys need removal" },
      { id: "sync-revocation-denied", label: "Old key deletion unconfirmed" },
      { id: "sync-removal-pending", label: "Shutdown interrupted" },
      {
        id: "sync-refresh-error",
        label: "Refresh fails after upload or shutdown",
      },
      { id: "sync-permission", label: "Storage permission missing" },
      { id: "sync-permission-error", label: "Storage permission check failed" },
      { id: "sync-pending", label: "Pending upload" },
      { id: "sync-error", label: "Connection error" },
      { id: "sync-session-expired", label: "Session expired" },
      { id: "sync-review", label: "Remote changes" },
      {
        id: "sync-organization-review",
        label: "Organization field changes",
      },
      { id: "sync-revision", label: "Newer revision, unchanged content" },
      { id: "sync-repair-error", label: "Key repair failure" },
      { id: "sync-loading", label: "Loading" },
    ],
  },
  {
    id: "popup-vault",
    name: "Popup · Vault",
    group: "Popup",
    states: [
      { id: "popup-ready", label: "Entries" },
      { id: "popup-empty", label: "Empty vault" },
      { id: "popup-locked", label: "Locked" },
      { id: "popup-multiple", label: "Choose vault" },
      { id: "popup-incomplete", label: "Finish setup" },
      { id: "popup-error", label: "Read error" },
    ],
  },
  {
    id: "popup-generator",
    name: "Popup · Generator",
    group: "Popup",
    states: [{ id: "popup-generator", label: "Ready" }],
  },
  {
    id: "popup-detected",
    name: "Popup · Detected",
    group: "Popup",
    states: [{ id: "popup-detected", label: "Detected login" }],
  },
  {
    id: "popup-settings",
    name: "Popup · Settings",
    group: "Popup",
    states: [{ id: "popup-settings", label: "Ready" }],
  },
  {
    id: "popup-sync",
    name: "Popup · Sync",
    group: "Popup",
    states: [
      { id: "popup-sync-current", label: "Up to date" },
      {
        id: "popup-sync-changed-during-check",
        label: "Changed while checking",
      },
      { id: "popup-sync-review", label: "Review remote changes" },
      { id: "popup-sync-review-read-error", label: "Review refresh error" },
      { id: "popup-sync-off", label: "Disabled" },
      { id: "popup-sync-permission", label: "Permission required" },
      { id: "popup-sync-error", label: "Check error" },
      { id: "popup-sync-upload", label: "Upload available" },
      { id: "popup-sync-pending", label: "Upload pending" },
      { id: "popup-sync-checking", label: "Checking" },
      { id: "popup-sync-upload-refresh-error", label: "Upload refresh error" },
      { id: "popup-sync-apply-refresh-error", label: "Apply refresh error" },
      {
        id: "popup-sync-pending-refresh-error",
        label: "Pending refresh error",
      },
    ],
  },
  {
    id: "popup-launch",
    name: "Popup · Vault access",
    group: "Popup",
    states: [
      { id: "welcome", label: "No vault" },
      { id: "existing", label: "Existing vault" },
      { id: "loading", label: "Loading" },
      { id: "error", label: "Error" },
      { id: "launch-open-error", label: "Options opening failed" },
    ],
  },
  {
    id: "welcome",
    name: "Setup choices",
    group: "Setup and recovery",
    states: [{ id: "welcome", label: "Default" }],
  },
  {
    id: "password",
    name: "Password",
    group: "Setup and recovery",
    states: [
      { id: "password", label: "Default" },
      { id: "password-pending", label: "Checking" },
      { id: "password-unavailable", label: "Error" },
    ],
  },
  {
    id: "device",
    name: "Device settings",
    group: "Setup and recovery",
    states: [
      { id: "device", label: "Default" },
      { id: "creation-pending", label: "Creating" },
      { id: "creation-error", label: "Error" },
    ],
  },
  {
    id: "organization",
    name: "Organization template",
    group: "Setup and recovery",
    states: [
      { id: "organization", label: "Default" },
      { id: "organization-pending", label: "Creating" },
      { id: "organization-error", label: "Error" },
      { id: "organization-name-conflicts", label: "Name conflicts" },
    ],
  },
  {
    id: "recover-access",
    name: "Recover access",
    group: "Setup and recovery",
    states: [
      { id: "recover-access", label: "Default" },
      { id: "recover-access-pending", label: "Setting password" },
      { id: "recover-access-error", label: "Recovery failed" },
    ],
  },
  {
    id: "recovery",
    name: "Save recovery words",
    group: "Setup and recovery",
    states: [
      { id: "recovery", label: "First setup" },
      { id: "recovery-upload-pending", label: "Enrollment upload pending" },
      { id: "recovered-words", label: "After password recovery" },
      { id: "export-error", label: "Export error" },
    ],
  },
  {
    id: "verification",
    name: "Verify recovery words",
    group: "Setup and recovery",
    states: [
      { id: "verification", label: "First setup" },
      { id: "recovered-verification", label: "After password recovery" },
      { id: "verification-pending", label: "Checking" },
      { id: "verification-error", label: "Error" },
    ],
  },
  {
    id: "connect",
    name: "Connect a vault",
    group: "Setup and recovery",
    states: [
      { id: "connect", label: "Vault identity" },
      { id: "connect-password", label: "Browser password" },
      { id: "connect-request", label: "Access request" },
      { id: "connect-approval", label: "Device approval" },
      { id: "connect-request-error", label: "Request error" },
      { id: "connect-approval-error", label: "Approval error" },
    ],
  },
  {
    id: "unlock",
    name: "Unlock vault",
    group: "Setup and recovery",
    states: [
      { id: "locked", label: "Default" },
      { id: "multiple-vaults", label: "Multiple local vaults" },
      { id: "unlock-pending", label: "Unlocking" },
      { id: "unlock-error", label: "Error" },
    ],
  },
  {
    id: "interrupted",
    name: "Interrupted recovery",
    group: "Setup and recovery",
    states: [
      { id: "backup-incomplete", label: "Default" },
      { id: "replacement-pending", label: "Generating" },
    ],
  },
  {
    id: "complete",
    name: "Entries after setup",
    group: "Setup and recovery",
    states: [{ id: "complete", label: "Ready workspace" }],
  },
  {
    id: "appearance",
    name: "Appearance",
    group: "Daily use",
    states: [{ id: "appearance", label: "Default" }],
  },
];
const screenGroups = [
  "Popup",
  "Daily use",
  "Sync and devices",
  "Setup and recovery",
] as const;
function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function selectedScreen() {
  return window.location.hash.slice(1);
}
function screenGroupId(group: (typeof screenGroups)[number]) {
  return `screen-group-${group.toLowerCase().replaceAll(" ", "-")}`;
}

export function ScreenGallery() {
  const selected = useSyncExternalStore(subscribeHash, selectedScreen);
  const screen = screens.find((item) => item.id === selected) ?? screens[0];
  const [variant, setVariant] = useState<OptionsScenario>();
  const state =
    screen.states.find((item) => item.id === variant)?.id ??
    screen.states[0].id;
  const { preference: theme, setTheme } = useTheme();
  const [width, setWidth] = useState("fluid");
  const [reset, setReset] = useState(0);
  const [notice, setNotice] = useState("");
  const popupScreen = screen.group === "Popup";
  return (
    <div className="min-h-svh bg-background text-foreground lg:fixed lg:inset-0 lg:flex lg:h-auto lg:min-h-0 lg:w-full lg:flex-col lg:overflow-hidden">
      <a
        href="#screen-presentation"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("screen-presentation")?.focus();
        }}
        className="review-skip"
      >
        Skip to screen
      </a>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4">
        <div className="flex flex-wrap items-center gap-5">
          <span className="font-semibold">LFSPM</span>
          <ReviewPageNavigation current="screens" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          Theme
          <NativeSelect
            aria-label="Presentation theme"
            value={theme}
            onChange={(event) =>
              setTheme(
                event.target.value === "light" || event.target.value === "dark"
                  ? event.target.value
                  : "system",
              )
            }
          >
            <NativeSelectOption value="system">System</NativeSelectOption>
            <NativeSelectOption value="dark">Dark</NativeSelectOption>
            <NativeSelectOption value="light">Light</NativeSelectOption>
          </NativeSelect>
        </label>
      </header>
      <div className="grid min-w-0 lg:min-h-0 lg:flex-1 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="border-b p-4 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <label className="flex items-center gap-3 text-sm lg:hidden">
            Screen
            <NativeSelect
              aria-label="Application screen"
              className="min-w-0 flex-1"
              value={screen.id}
              onChange={(event) => {
                window.location.hash = event.target.value;
                setVariant(undefined);
                setNotice("");
                setWidth("fluid");
              }}
            >
              {screenGroups.map((group) => (
                <NativeSelectOptGroup key={group} label={group}>
                  {screens
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <NativeSelectOption key={item.id} value={item.id}>
                        {item.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelectOptGroup>
              ))}
            </NativeSelect>
          </label>
          <nav
            aria-label="Application screens"
            className="hidden space-y-5 lg:block"
          >
            {screenGroups.map((group) => (
              <section key={group} aria-labelledby={screenGroupId(group)}>
                <h2
                  id={screenGroupId(group)}
                  className="mb-2 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {group}
                </h2>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
                  {screens
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        aria-current={
                          screen.id === item.id ? "page" : undefined
                        }
                        onClick={() => {
                          setVariant(undefined);
                          setNotice("");
                          setWidth("fluid");
                        }}
                        className={`rounded-md border px-3 py-2.5 text-sm ${screen.id === item.id ? "border-primary bg-accent font-semibold" : "border-transparent hover:bg-accent"}`}
                      >
                        {item.name}
                      </a>
                    ))}
                </div>
              </section>
            ))}
          </nav>
        </aside>
        <main
          id="screen-presentation"
          className="min-w-0 p-4 sm:p-6 lg:min-h-0 lg:overflow-y-auto"
          tabIndex={-1}
          data-focus-target
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold">{screen.name}</h1>
            <Button
              variant="outline"
              onClick={() => {
                setReset((value) => value + 1);
                setNotice("");
              }}
            >
              Reset screen
            </Button>
          </div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div
              role="group"
              aria-label="Screen state"
              className="flex flex-wrap gap-2"
            >
              {screen.states.map((item) => (
                <Button
                  key={item.id}
                  variant={state === item.id ? "secondary" : "ghost"}
                  aria-pressed={state === item.id}
                  onClick={() => {
                    setVariant(item.id);
                    setNotice("");
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <div
              role="group"
              aria-label="Screen width"
              className="flex flex-wrap gap-2"
            >
              {(popupScreen
                ? [
                    { id: "fluid", label: "Native 480 px" },
                    { id: "320", label: "320 px" },
                    { id: "400", label: "400 px" },
                  ]
                : [
                    { id: "fluid", label: "Fit window" },
                    { id: "320", label: "320 px" },
                    { id: "400", label: "400 px" },
                    { id: "768", label: "768 px" },
                  ]
              ).map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={width === item.id ? "secondary" : "ghost"}
                  aria-pressed={width === item.id}
                  onClick={() => setWidth(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <div
            aria-label="Screen canvas"
            className="review-canvas mx-auto min-h-96 max-w-full rounded-lg border bg-background"
            style={{
              width:
                width === "fluid"
                  ? popupScreen
                    ? "var(--extension-popup-width)"
                    : "100%"
                  : `${width}px`,
            }}
          >
            <div
              key={`${screen.id}:${state}:${reset}`}
              className={cn(
                !popupScreen && "options-surface",
                popupScreen
                  ? ""
                  : [
                        "application",
                        "welcome",
                        "password",
                        "device",
                        "organization",
                        "connect",
                      ].includes(screen.id) &&
                      ![
                        "creation-pending",
                        "creation-error",
                        "organization-pending",
                        "organization-error",
                        "organization-name-conflicts",
                      ].includes(state)
                    ? ""
                    : screen.id === "workspace"
                      ? "mx-auto max-w-6xl px-5 py-8"
                      : [
                            "s3-setup",
                            "sync",
                            "devices",
                            "tags",
                            "tools",
                            "trust",
                            "vault-settings",
                          ].includes(screen.id)
                        ? "mx-auto max-w-6xl px-5 py-8 @lg:py-12"
                        : "mx-auto max-w-xl px-5 py-8 @lg:py-12",
              )}
            >
              {popupScreen && !state.startsWith("popup-") ? (
                <PopupView
                  availability={
                    state === "existing" ||
                    state === "loading" ||
                    state === "error"
                      ? state
                      : "empty"
                  }
                  initialOpenFailed={state === "launch-open-error"}
                  onRetry={() => setNotice("Retry requested")}
                  onOpenOptions={async () => {
                    window.location.hash = "welcome";
                  }}
                />
              ) : (
                <OptionsExample
                  state={state}
                  preference={theme}
                  onThemeChange={setTheme}
                />
              )}
            </div>
          </div>
          {notice ? (
            <p role="status" className="mt-4 text-sm">
              {notice}
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
