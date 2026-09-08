import type { VaultManagerDb } from "../../infrastructure/database/dexie-db";
import type { BrowserLoginRuntimeCapabilities } from "../composition/browser-login-application.type";
import { composeBrowserLoginApplication } from "../composition/browser-login.composition";
import { composeSession } from "../composition/session.composition";
import {
  composeScheduledTaskAlarmHandler,
  type ScheduledTaskAlarmHandler,
} from "./clipboard-alarm-runtime";

export type BackgroundApplication = {
  readonly browserLogins: BrowserLoginRuntimeCapabilities;
  readonly handleScheduledTaskAlarm: ScheduledTaskAlarmHandler;
};

export function composeBackgroundApplication(
  database?: VaultManagerDb,
): BackgroundApplication {
  const sessionResources = composeSession(database);

  return {
    browserLogins: composeBrowserLoginApplication(sessionResources),
    handleScheduledTaskAlarm:
      composeScheduledTaskAlarmHandler(sessionResources),
  };
}
