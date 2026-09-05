import { useCallback, useRef, useState } from "react";
import { CheckPasswordStrengthUseCase } from "@lfspm/core";
import { OptionsView } from "@/ui/entrypoints/options/options.view";
import { PopupView } from "@/ui/entrypoints/popup/popup.view";
import { Specimen, Scenario } from "./specimen.view";
const strength = new CheckPasswordStrengthUseCase();
type OptionsScenario =
  | "welcome"
  | "password"
  | "password-pending"
  | "password-unavailable"
  | "device"
  | "connect"
  | "existing"
  | "loading"
  | "error";
function OptionsExample({
  state,
  preference,
  onThemeChange,
  onRetry,
}: {
  state: OptionsScenario;
  preference: "light" | "dark" | "system";
  onThemeChange: (preference: "light" | "dark" | "system") => void;
  onRetry: () => void;
}) {
  const failed = useRef(false);
  const assessPassword = useCallback(
    async (password: string) => {
      if (state === "password-pending")
        return new Promise<{ score: 0 | 1 | 2 | 3 | 4 }>(() => {});
      if (state === "password-unavailable" && !failed.current) {
        failed.current = true;
        throw new Error("Assessment unavailable");
      }
      return strength.execute({ password });
    },
    [state],
  );
  return (
    <OptionsView
      preference={preference}
      onThemeChange={onThemeChange}
      availability={
        state === "existing" || state === "loading" || state === "error"
          ? state
          : "empty"
      }
      initialStep={
        state === "password-pending" || state === "password-unavailable"
          ? "password"
          : state === "welcome" ||
              state === "password" ||
              state === "device" ||
              state === "connect"
            ? state
            : "welcome"
      }
      onRetry={onRetry}
      assessPassword={assessPassword}
    />
  );
}
export function ScreenExamples() {
  const [preference, setPreference] = useState<"light" | "dark" | "system">(
    "system",
  );
  const [action, setAction] = useState("");
  return (
    <div className="space-y-8">
      <Specimen id="S01" name="PopupView" owner="entrypoints/popup">
        <Scenario
          label="First-launch popup"
          options={
            ["empty", "existing", "loading", "error", "open-error"] as const
          }
        >
          {(state) => (
            <PopupView
              availability={state === "open-error" ? "empty" : state}
              onRetry={() => setAction("Retry requested")}
              onOpenOptions={async () => {
                if (state === "open-error")
                  throw new Error("Synthetic opening failure");
                setAction("Options opening requested");
              }}
            />
          )}
        </Scenario>
        {action ? (
          <p role="status" className="text-xs text-muted-foreground">
            {action}
          </p>
        ) : null}
      </Specimen>
      <Specimen
        id="S02"
        name="OptionsView"
        owner="entrypoints/options · vault-setup"
        wide
      >
        <Scenario
          label="First-launch options"
          options={
            [
              "welcome",
              "password",
              "password-pending",
              "password-unavailable",
              "device",
              "connect",
              "existing",
              "loading",
              "error",
            ] as const
          }
        >
          {(state) => (
            <OptionsExample
              state={state}
              preference={preference}
              onThemeChange={setPreference}
              onRetry={() => setAction("Retry requested")}
            />
          )}
        </Scenario>
      </Specimen>
    </div>
  );
}
