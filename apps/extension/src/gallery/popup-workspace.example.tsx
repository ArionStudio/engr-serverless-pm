import { useState } from "react";
import { PopupWorkspace } from "@/ui/entrypoints/popup/popup-workspace.view";
import { gallerySetup, setupVault } from "./setup-fixture";
import { galleryWorkspace } from "./workspace-fixture";
export function PopupWorkspaceExample({
  state = "ready",
}: {
  state?: "ready" | "empty" | "locked" | "multiple" | "incomplete" | "error";
}) {
  const [workspace] = useState(() =>
    galleryWorkspace(
      state === "empty"
        ? "workspace-empty"
        : state === "error"
          ? "workspace-error"
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
      <PopupWorkspace
        setup={setup}
        workspace={workspace}
        onOpenOptions={async () => setNotice("Options opening requested")}
      />
      {notice ? <p role="status">{notice}</p> : null}
    </>
  );
}
