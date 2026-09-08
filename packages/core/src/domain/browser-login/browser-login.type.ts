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
  readonly expiresAt: number;
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
