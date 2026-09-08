import { useState } from "react";
import { EntryWorkspace } from "@/ui/features/entries/entry-workspace.view";
import { galleryWorkspace, type WorkspaceScenario } from "./workspace-fixture";
export function WorkspaceExample({
  state = "workspace",
}: {
  state?: WorkspaceScenario;
}) {
  const [capabilities] = useState(() => galleryWorkspace(state));
  const [notice, setNotice] = useState("");
  return (
    <>
      <EntryWorkspace
        vaultId="gallery-vault"
        capabilities={capabilities}
        onLock={() => setNotice("Lock requested")}
        onSync={() => setNotice("Sync requested")}
      />
      {notice ? <p role="status">{notice}</p> : null}
    </>
  );
}
