import { useState } from "react";
import { PopupSettings } from "@/ui/entrypoints/popup/popup-settings.view";
import {
  galleryVaultSettings,
  type SettingsScenario,
} from "./settings-fixture";
import { setupVault } from "./setup-fixture";
export function PopupSettingsExample({ state }: { state: SettingsScenario }) {
  const [capabilities] = useState(() => galleryVaultSettings(state));
  const [message, setMessage] = useState("");
  return (
    <div className="max-w-[30rem]">
      <PopupSettings
        vault={{ ...setupVault, unlocked: true, complete: true }}
        capabilities={capabilities}
        onSaved={() => {}}
        onSessionLost={() =>
          setMessage("Authorization lost; root refresh requested.")
        }
        onBusyChange={() => {}}
        onOpenOptions={() => setMessage("Full vault settings requested")}
      />
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
