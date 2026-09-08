import { composeBackgroundApplication } from "./background.composition";
import { installBrowserLoginRuntime } from "./browser-login-runtime";

const application = composeBackgroundApplication();

chrome.alarms.onAlarm.addListener((alarm) => {
  void application.handleScheduledTaskAlarm(alarm).catch(() => {
    console.error("Scheduled task alarm handling failed.");
  });
});

installBrowserLoginRuntime(application.browserLogins);
