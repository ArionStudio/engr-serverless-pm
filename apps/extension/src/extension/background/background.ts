import { composeScheduledTaskAlarmHandler } from "./clipboard-alarm-runtime";

const handleScheduledTaskAlarm = composeScheduledTaskAlarmHandler();

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleScheduledTaskAlarm(alarm).catch(() => {
    console.error("Scheduled task alarm handling failed.");
  });
});
