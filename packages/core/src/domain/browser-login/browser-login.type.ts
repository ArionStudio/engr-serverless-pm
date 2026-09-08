import type { DeviceLocalProtectionKey } from "../device-trust/brand-keys";

export type BrowserLoginForm = {
  readonly kind: "identifier" | "sign-in" | "registration" | "password-change";
  readonly fields: readonly (
    | "email"
    | "username"
    | "current-password"
    | "new-password"
    | "confirm-password"
  )[];
};

export type BrowserLoginTarget = {
  readonly form: BrowserLoginForm | null;
  readonly formToken: string | null;
  readonly tabId: number;
  readonly url: string;
  readonly documentToken: string;
  readonly fillable: boolean;
};
export type CapturedLogin = {
  readonly id: string;
  readonly tabId: number;
  readonly url: string;
  readonly login: string;
  readonly password: string;
  // null keeps the capture for its owning unlocked session.
  readonly expiresAt: number | null;
};
export type CapturedLoginContext = {
  readonly vaultId: string;
  readonly sessionId: string;
  readonly protectionKey: DeviceLocalProtectionKey;
};
export type BrowserLoginMatch = {
  readonly id: string;
  readonly login: string;
  readonly url: string;
};
export type BrowserLogins = {
  readonly target: BrowserLoginTarget | null;
  readonly entries: readonly BrowserLoginMatch[];
  readonly captured: CapturedLogin | null;
  readonly updateEntryIds: readonly string[];
};

export type BrowserLoginPage = {
  readonly tabId: number;
  readonly url: string;
};
export type BrowserLoginSubmission = BrowserLoginPage & {
  readonly login: string;
  readonly password: string;
};
export type CaptureBrowserLoginCommand = BrowserLoginSubmission & {
  readonly deadlineEpochMs: number;
  readonly retainForSession?: boolean;
};
export type CaptureBrowserLoginResult = { readonly captured: boolean };
