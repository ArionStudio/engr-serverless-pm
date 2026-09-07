import { useEffect, useState, useSyncExternalStore } from "react";
import { OptionsExample, type OptionsScenario } from "./screen-examples.view";
import { PopupView } from "@/ui/entrypoints/popup/popup.view";
import { Button } from "@/ui/components/primitives/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
import { ReviewPageNavigation } from "./review-page-navigation.view";

const screens: readonly {
  id: string;
  name: string;
  states: readonly { id: OptionsScenario; label: string }[];
}[] = [
  {
    id: "s3-setup",
    name: "Set up S3",
    states: [
      { id: "s3-guide", label: "Instructions" },
      { id: "s3-copy-error", label: "Copy error" },
    ],
  },
  {
    id: "sync",
    name: "Sync",
    states: [
      { id: "sync-setup", label: "Set up" },
      { id: "sync-access-pending", label: "Pending access check" },
      { id: "sync-configured", label: "Configured" },
      { id: "sync-pending", label: "Pending upload" },
      { id: "sync-error", label: "Connection error" },
      { id: "sync-review", label: "Remote changes" },
      { id: "sync-loading", label: "Loading" },
    ],
  },
  {
    id: "popup",
    name: "Popup",
    states: [
      { id: "welcome", label: "No vault" },
      { id: "existing", label: "Existing vault" },
      { id: "loading", label: "Loading" },
      { id: "error", label: "Error" },
    ],
  },
  {
    id: "welcome",
    name: "Setup choices",
    states: [{ id: "welcome", label: "Default" }],
  },
  {
    id: "password",
    name: "Password",
    states: [
      { id: "password", label: "Default" },
      { id: "password-pending", label: "Checking" },
      { id: "password-unavailable", label: "Error" },
    ],
  },
  {
    id: "device",
    name: "Device settings",
    states: [
      { id: "device", label: "Default" },
      { id: "creation-pending", label: "Creating" },
      { id: "creation-error", label: "Error" },
    ],
  },
  {
    id: "recovery",
    name: "Save recovery words",
    states: [
      { id: "recovery", label: "Default" },
      { id: "export-error", label: "Export error" },
    ],
  },
  {
    id: "verification",
    name: "Verify recovery words",
    states: [
      { id: "verification", label: "Default" },
      { id: "verification-pending", label: "Checking" },
      { id: "verification-error", label: "Error" },
    ],
  },
  {
    id: "connect",
    name: "Connect a vault",
    states: [{ id: "connect", label: "Default" }],
  },
  {
    id: "unlock",
    name: "Unlock vault",
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
    states: [
      { id: "backup-incomplete", label: "Default" },
      { id: "replacement-pending", label: "Generating" },
    ],
  },
  {
    id: "complete",
    name: "Vault ready",
    states: [{ id: "complete", label: "Default" }],
  },
  {
    id: "settings",
    name: "Lock settings",
    states: [
      { id: "lock-settings", label: "Default" },
      { id: "lock-settings-pending", label: "Saving" },
      { id: "lock-settings-error", label: "Error" },
    ],
  },
  {
    id: "appearance",
    name: "Appearance",
    states: [{ id: "appearance", label: "Default" }],
  },
];
function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function selectedScreen() {
  return window.location.hash.slice(1);
}

export function ScreenGallery() {
  const selected = useSyncExternalStore(subscribeHash, selectedScreen);
  const screen = screens.find((item) => item.id === selected) ?? screens[1];
  const [variant, setVariant] = useState<OptionsScenario>();
  const state =
    screen.states.find((item) => item.id === variant)?.id ??
    screen.states[0].id;
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");
  const [width, setWidth] = useState("fluid");
  const [reset, setReset] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && query.matches),
      );
    apply();
    query.addEventListener("change", apply);
    return () => {
      query.removeEventListener("change", apply);
      document.documentElement.classList.remove("dark");
    };
  }, [theme]);
  return (
    <div className="min-h-svh bg-background text-foreground">
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
      <div className="grid min-w-0 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="border-b p-4 lg:min-h-[calc(100svh-5rem)] lg:border-r lg:border-b-0">
          <nav
            aria-label="Application screens"
            className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:sticky lg:top-4 lg:grid-cols-1"
          >
            {screens.map((item, index) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={screen.id === item.id ? "page" : undefined}
                onClick={() => {
                  setVariant(undefined);
                  setNotice("");
                }}
                className={`flex items-center gap-3 rounded-md border px-3 py-3 text-sm ${screen.id === item.id ? "border-primary bg-accent font-semibold" : "border-transparent hover:bg-accent"}`}
              >
                <span
                  aria-hidden="true"
                  className="text-xs text-muted-foreground tabular-nums"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                {item.name}
              </a>
            ))}
          </nav>
        </aside>
        <main
          id="screen-presentation"
          className="min-w-0 p-4 sm:p-6"
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
              {[
                { id: "fluid", label: "Fit window" },
                { id: "400", label: "400 px" },
                { id: "768", label: "768 px" },
              ].map((item) => (
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
                screen.id === "popup"
                  ? "400px"
                  : width === "fluid"
                    ? "100%"
                    : `${width}px`,
            }}
          >
            <div
              key={`${screen.id}:${state}:${reset}`}
              className={
                ["popup", "welcome", "password", "device", "connect"].includes(
                  screen.id,
                ) && !["creation-pending", "creation-error"].includes(state)
                  ? ""
                  : ["s3-setup", "sync"].includes(screen.id)
                    ? "mx-auto max-w-4xl px-5 py-8 @lg:py-12"
                    : "mx-auto max-w-xl px-5 py-8 @lg:py-12"
              }
            >
              {screen.id === "popup" ? (
                <PopupView
                  availability={
                    state === "existing" ||
                    state === "loading" ||
                    state === "error"
                      ? state
                      : "empty"
                  }
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
