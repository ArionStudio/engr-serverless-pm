import { mountLoginFieldAction } from "../extension/content/login-field-action";
import type { BrowserLoginForm } from "@lfspm/core";
import { useEffect, useRef, useState } from "react";
import { BrowserLoginsPanel } from "@/ui/features/entries/browser-logins.view";
import { mountLoginCapturePrompt } from "../extension/content/login-capture-prompt";
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
        onSessionLost={() => setNotice("Vault session refresh requested")}
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
export function LoginCapturePromptExample() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      host.current
        ? mountLoginCapturePrompt(host.current, { onReview: async () => false })
        : undefined,
    [],
  );
  return <div ref={host} className="max-w-[360px]" />;
}

export function LoginFieldActionExample({
  kind,
}: {
  kind: BrowserLoginForm["kind"];
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      host.current
        ? mountLoginFieldAction(host.current, kind, async () => false)
        : undefined,
    [kind],
  );
  return <div ref={host} />;
}
