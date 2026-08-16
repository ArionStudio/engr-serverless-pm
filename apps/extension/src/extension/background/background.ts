import { composeClipboardAlarmHandler } from "./clipboard-alarm-runtime";

const handleClipboardAlarm = composeClipboardAlarmHandler();

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleClipboardAlarm(alarm).catch(() => {
    console.error(
      "Clipboard alarm handling failed; verify the clipboard is clear.",
    );
  });
});
