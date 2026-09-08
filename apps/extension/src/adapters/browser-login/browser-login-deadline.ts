export const BROWSER_LOGIN_REQUEST_TIMEOUT_MS = 5_000;

export function isLiveBrowserLoginDeadline(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value > Date.now()
  );
}
