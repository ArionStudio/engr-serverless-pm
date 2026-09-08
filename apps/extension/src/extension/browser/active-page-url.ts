import { sanitizeEntryUrl } from "@lfspm/core";

export async function readActivePageUrl(): Promise<string> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab?.url ? sanitizeEntryUrl(tab.url) : "";
  } catch {
    // Restricted pages and unavailable activeTab access keep manual entry available.
    return "";
  }
}
