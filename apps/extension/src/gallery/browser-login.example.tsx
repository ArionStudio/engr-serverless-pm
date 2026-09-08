import { useState } from "react";
import { BrowserLoginsPanel } from "@/ui/features/entries/browser-logins.view";
import {
  galleryBrowserLogins,
  type BrowserLoginScenario,
} from "./browser-login-fixture";
export function BrowserLoginExample({
  scenario,
  mode = "matches",
}: {
  scenario: BrowserLoginScenario;
  mode?: "matches" | "detected";
}) {
  const [capabilities] = useState(() => galleryBrowserLogins(scenario));
  const [notice, setNotice] = useState("");
  return (
    <div className="max-w-[30rem]">
      <BrowserLoginsPanel
        vaultId="gallery-vault"
        mode={mode}
        capabilities={capabilities}
        onReview={(_, id) =>
          setNotice(
            id
              ? "Existing entry editor requested"
              : "New entry editor requested",
          )
        }
      />
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}
