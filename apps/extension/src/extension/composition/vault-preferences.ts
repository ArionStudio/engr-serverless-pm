import { AVAILABLE_VAULT_LOCK_DELAYS_MS } from "@lfspm/core";

export const preferenceKey = (vaultId: string) => `vault-setup:${vaultId}`;
export type Preference = {
  duration: number;
  deviceName: string;
  complete: boolean;
  token: string;
};
const supportedDuration = (value: number) =>
  AVAILABLE_VAULT_LOCK_DELAYS_MS.find((option) => option === value);
export function durationValue(value: number) {
  const duration = supportedDuration(value);
  if (duration === undefined) throw new Error("Invalid lock duration");
  return duration;
}
export async function preference(vaultId: string): Promise<Preference> {
  const value: unknown = (
    await chrome.storage.local.get(preferenceKey(vaultId))
  )[preferenceKey(vaultId)];
  if (
    typeof value === "object" &&
    value !== null &&
    "duration" in value &&
    typeof value.duration === "number" &&
    "deviceName" in value &&
    typeof value.deviceName === "string" &&
    "complete" in value &&
    typeof value.complete === "boolean" &&
    "token" in value &&
    typeof value.token === "string"
  ) {
    return {
      duration: supportedDuration(value.duration) ?? 600_000,
      deviceName: value.deviceName,
      complete: value.complete,
      token: value.token,
    };
  }
  return {
    duration: 600_000,
    deviceName: "This browser",
    complete: false,
    token: "",
  };
}
export const writePreference = (vaultId: string, value: Preference) =>
  chrome.storage.local.set({ [preferenceKey(vaultId)]: value });
