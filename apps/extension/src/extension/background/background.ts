// Chrome Extension Background Script
chrome.runtime.onInstalled.addListener(() => {
  console.log("SPM Extension installed");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received:", request);
  console.log("Sender:", sender);
  sendResponse({ status: "received" });
});

// Hot reload helper for development
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log("Background script hot reloaded");
  });
}
