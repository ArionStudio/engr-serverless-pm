import { composeClipboardAlarmHandler } from "./clipboard-alarm-runtime";

const handleClipboardAlarm = composeClipboardAlarmHandler();

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleClipboardAlarm(alarm).catch(() => {
    console.error(
      "Clipboard cleanup failed; clear the clipboard manually if needed.",
    );
  });
});
