import { Button } from "@/ui/components/primitives/button";
import { galleryPopupSync, type PopupSyncScenario } from "./popup-sync-fixture";
import { galleryVaultSettings } from "./settings-fixture";
import { galleryBrowserLogins } from "./browser-login-fixture";
import { useState } from "react";
import { PopupWorkspace } from "@/ui/entrypoints/popup/popup-workspace.view";
import { gallerySetup, setupVault } from "./setup-fixture";
import { galleryWorkspace } from "./workspace-fixture";
export function PopupWorkspaceExample({
  state = "ready",
}: {
  state?:
    | "ready"
    | "empty"
    | "locked"
    | "multiple"
    | "incomplete"
    | "error"
    | "reveal-error"
    | PopupSyncScenario;
}) {
  const [sync] = useState(() =>
    galleryPopupSync(
      state.startsWith("sync-") ? (state as PopupSyncScenario) : "sync-current",
    ),
  );
  const [browserLogins] = useState(() =>
    galleryBrowserLogins(state === "empty" ? "save" : "matching"),
  );
  const [settings] = useState(() => galleryVaultSettings());
  const [workspace] = useState(() =>
    galleryWorkspace(
      state === "empty"
        ? "workspace-empty"
        : state === "error"
          ? "workspace-error"
          : state === "reveal-error"
            ? "workspace-reveal-error"
            : "workspace",
    ),
  );
  const [setup] = useState(() => {
    if (state === "multiple") return gallerySetup("multiple");
    const capabilities = gallerySetup();
    let vault = {
      ...setupVault,
      complete: state !== "incomplete",
      unlocked: state !== "locked",
    };
    capabilities.inspect = async () => ({ vault, vaults: [vault] });
    capabilities.unlock = async () => {
      vault = { ...vault, unlocked: true };
      return vault;
    };
    capabilities.lock = async () => {
      vault = { ...vault, unlocked: false };
    };
    return capabilities;
  });
  const [notice, setNotice] = useState("");
  return (
    <>
      {state === "sync-review-read-error" ? (
        <Button variant="outline" onClick={sync.simulateFailedRefresh}>
          Fail subscription refresh
        </Button>
      ) : null}
      <PopupWorkspace
        setup={setup}
        sync={sync}
        workspace={workspace}
        settings={settings}
        browserLogins={browserLogins}
        onOpenOptions={async () => setNotice("Options opening requested")}
      />
      {notice ? <p role="status">{notice}</p> : null}
    </>
  );
}
