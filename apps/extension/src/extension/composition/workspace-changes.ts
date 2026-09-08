import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";
const channelName = "lfspm-workspace-changed";
function sessionId(value: unknown) {
  return typeof value === "object" && value !== null && "sessionId" in value
    ? value.sessionId
    : undefined;
}
export function subscribeWorkspaceChanges(
  listener: Parameters<WorkspaceCapabilities["subscribe"]>[0],
) {
  const channel = new BroadcastChannel(channelName);
  channel.onmessage = () => listener("data");
  const onStorage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    const change = changes.unlockedVaultSessionMaterial;
    if (area === "session" && change)
      listener(
        sessionId(change.oldValue) !== sessionId(change.newValue)
          ? "session"
          : "data",
      );
  };
  const onFocus = () => listener("focus");
  chrome.storage.onChanged.addListener(onStorage);
  window.addEventListener("focus", onFocus);
  return () => {
    channel.close();
    chrome.storage.onChanged.removeListener(onStorage);
    window.removeEventListener("focus", onFocus);
  };
}
