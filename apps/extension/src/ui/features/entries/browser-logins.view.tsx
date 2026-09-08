import { Switch } from "@/ui/components/primitives/switch";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { BrowserLogins, CapturedLogin } from "@lfspm/core";
import type { BrowserLoginCapabilities } from "./browser-login.type";
import { Button } from "@/ui/components/primitives/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Globe02Icon, Login01Icon } from "@hugeicons/core-free-icons";
import { vaultAuthorizationWasLost } from "@/ui/lib/vault-authorization";

const formLabels = {
  identifier: "Email or username step detected",
  "sign-in": "Sign-in form detected",
  registration: "Registration form detected",
  "password-change": "Password-change form detected",
};
const fieldLabels = {
  email: "Email",
  username: "Username",
  "current-password": "Password",
  "new-password": "New password",
  "confirm-password": "Confirm password",
};

export function BrowserLoginsPanel({
  vaultId,
  capabilities,
  onReview,
  mode = "matches",
  onPendingChange,
  onSessionLost,
}: {
  mode?: "matches" | "detected";
  onPendingChange?: (pending: boolean) => void;
  vaultId: string;
  capabilities: BrowserLoginCapabilities;
  onReview: (captured: CapturedLogin, entryId?: string) => void;
  onSessionLost?: () => void;
}) {
  const [data, setData] = useState<BrowserLogins>();
  const [enabled, setEnabled] = useState<boolean>();
  const [retainForSession, setRetainForSession] = useState<boolean>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const owner = useRef(0);
  const readOwner = useRef(0);
  const busy = useRef(false);
  const detectionLabel = useId();
  const retentionLabel = useId();
  const retentionGuidance = useId();
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  const clearPrivateState = useCallback(() => {
    owner.current += 1;
    readOwner.current += 1;
    busy.current = false;
    setData(undefined);
    setEnabled(undefined);
    setRetainForSession(undefined);
    setPending(false);
    setError(undefined);
    setFeedback(undefined);
  }, []);
  const stopForAuthorizationLoss = useCallback(
    async (cause: unknown, generation: number, readGeneration?: number) => {
      if (
        owner.current !== generation ||
        (readGeneration !== undefined && readOwner.current !== readGeneration)
      )
        return true;
      const lost = await vaultAuthorizationWasLost(cause, () =>
        capabilities.inspectAuthorization(vaultId),
      );
      if (
        owner.current !== generation ||
        (readGeneration !== undefined && readOwner.current !== readGeneration)
      )
        return true;
      if (lost) {
        clearPrivateState();
        onSessionLost?.();
      }
      return lost;
    },
    [capabilities, clearPrivateState, onSessionLost, vaultId],
  );
  const handleFailure = useCallback(
    async (
      cause: unknown,
      generation: number,
      message: string,
      readGeneration?: number,
    ) => {
      if (await stopForAuthorizationLoss(cause, generation, readGeneration))
        return;
      if (
        owner.current === generation &&
        (readGeneration === undefined || readOwner.current === readGeneration)
      )
        setError(message);
    },
    [stopForAuthorizationLoss],
  );
  useEffect(() => {
    const generation = ++owner.current;
    const readGeneration = ++readOwner.current;
    busy.current = false;
    setData(undefined);
    setEnabled(undefined);
    setRetainForSession(undefined);
    setPending(false);
    setError(undefined);
    setFeedback(undefined);
    void capabilities.read(vaultId).then(
      (result) => {
        if (
          owner.current === generation &&
          readOwner.current === readGeneration
        )
          setData(result);
      },
      (cause: unknown) => {
        void handleFailure(
          cause,
          generation,
          "Could not read this page. Reopen the popup to try again.",
          readGeneration,
        );
      },
    );
    if (mode === "detected")
      void Promise.all([
        capabilities.detectionEnabled(),
        capabilities.sessionRetentionEnabled(),
      ]).then(
        ([detection, retention]) => {
          if (owner.current === generation) {
            setEnabled(detection);
            setRetainForSession(retention);
          }
        },
        () => {
          if (owner.current === generation)
            setError(
              "Could not read login detection settings. Reopen the popup to try again.",
            );
        },
      );
    return () => {
      owner.current = generation + 1;
      readOwner.current = readGeneration + 1;
      busy.current = false;
    };
  }, [vaultId, capabilities, mode, handleFailure]);
  // Recheck the session and capture before putting its password into an editor.
  async function review(entryId?: string) {
    await run(async (generation) => {
      const fresh = await capabilities.read(vaultId);
      if (owner.current !== generation) return;
      if (!fresh.captured || fresh.captured.id !== data?.captured?.id) {
        setError(
          "This captured login expired. Sign in on the website again to save it.",
        );
        return;
      }
      if (entryId && !fresh.updateEntryIds.includes(entryId)) {
        setError(
          "This saved login changed. Reopen the popup before reviewing an update.",
        );
        return;
      }
      onReview(fresh.captured, entryId);
    }, "Could not review this login. Reopen the popup to try again.");
  }
  async function run(
    operation: (generation: number) => Promise<void>,
    failure: string,
  ) {
    if (busy.current) return;
    busy.current = true;
    const generation = owner.current;
    setPending(true);
    setError(undefined);
    setFeedback(undefined);
    try {
      await operation(generation);
    } catch (cause) {
      await handleFailure(cause, generation, failure);
    } finally {
      if (owner.current === generation) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  async function changeSetting({
    generation,
    next,
    set,
    get,
    apply,
    failure,
    partialFailure,
    refreshFailure,
  }: {
    generation: number;
    next: boolean;
    set: (value: boolean) => Promise<void>;
    get: () => Promise<boolean>;
    apply: (value: boolean | undefined) => void;
    failure: string;
    partialFailure: string;
    refreshFailure: string;
  }) {
    const readGeneration = ++readOwner.current;
    setData(undefined);
    try {
      await set(next);
    } catch (cause) {
      if (await stopForAuthorizationLoss(cause, generation)) return;
      let authoritative: boolean | undefined;
      let fresh: BrowserLogins | undefined;
      try {
        authoritative = await get();
      } catch (readCause) {
        if (
          await stopForAuthorizationLoss(readCause, generation, readGeneration)
        )
          return;
      }
      if (owner.current !== generation || readOwner.current !== readGeneration)
        return;
      try {
        fresh = await capabilities.read(vaultId);
      } catch (readCause) {
        if (
          await stopForAuthorizationLoss(readCause, generation, readGeneration)
        )
          return;
      }
      if (owner.current !== generation || readOwner.current !== readGeneration)
        return;
      apply(authoritative);
      setData(fresh);
      setError(authoritative === next ? partialFailure : failure);
      return;
    }
    if (owner.current !== generation || readOwner.current !== readGeneration)
      return;
    apply(next);
    try {
      const fresh = await capabilities.read(vaultId);
      if (owner.current === generation && readOwner.current === readGeneration)
        setData(fresh);
    } catch (cause) {
      await handleFailure(cause, generation, refreshFailure, readGeneration);
    }
  }
  const target = data?.target;
  const captured = data?.captured;
  return (
    <section
      aria-label={mode === "detected" ? "Detected logins" : "Website logins"}
      className={
        mode === "detected"
          ? "space-y-5"
          : "space-y-3 border-b border-border pb-4"
      }
    >
      {mode === "detected" ? (
        <section
          className="space-y-3 rounded-lg border border-border bg-card p-4"
          aria-label="Login detection settings"
        >
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span id={detectionLabel} className="text-sm font-semibold">
              Login detection
            </span>
            <span className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {enabled === undefined ? "Loading…" : enabled ? "On" : "Off"}
              </span>
              <Switch
                aria-labelledby={detectionLabel}
                checked={enabled ?? false}
                disabled={pending || enabled === undefined}
                onCheckedChange={(next) =>
                  void run(
                    (generation) =>
                      changeSetting({
                        generation,
                        next,
                        set: capabilities.setDetection,
                        get: capabilities.detectionEnabled,
                        apply: setEnabled,
                        failure: next
                          ? "Could not enable login detection. Allow website access in the browser extension permissions, then try again. If LFSPM was updated, reload the extension first."
                          : "Could not turn off login detection. Try again.",
                        partialFailure: next
                          ? "Login detection is on, but setup did not finish. Reload the extension, then try again."
                          : "Login detection is off, but LFSPM could not finish clearing detected logins or stopping detection on open websites. Lock the vault and reload those websites.",
                        refreshFailure: `Login detection is ${next ? "on" : "off"}, but this page could not be refreshed. Reopen the popup to continue.`,
                      }),
                    next
                      ? "Could not enable login detection. Allow website access in the browser extension permissions, then try again. If LFSPM was updated, reload the extension first."
                      : "Could not turn off login detection. Try again.",
                  )
                }
              />
            </span>
          </label>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Recognize sign-in and registration fields, and offer to save website
            logins while your vault is unlocked. You review each login before
            saving it.
          </p>
          <div className="space-y-2 border-t border-border pt-3">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span id={retentionLabel} className="text-sm font-semibold">
                Keep detected login across page changes
              </span>
              <Switch
                aria-labelledby={retentionLabel}
                aria-describedby={retentionGuidance}
                checked={retainForSession ?? false}
                disabled={pending || !enabled || retainForSession === undefined}
                onCheckedChange={(next) =>
                  void run(
                    (generation) =>
                      changeSetting({
                        generation,
                        next,
                        set: capabilities.setSessionRetention,
                        get: capabilities.sessionRetentionEnabled,
                        apply: setRetainForSession,
                        failure: "Could not change login retention. Try again.",
                        partialFailure: next
                          ? "Login retention is on, but setup did not finish. Reopen the popup, then try again."
                          : "Login retention is off, but some detected logins could not be cleared. Lock the vault to clear them.",
                        refreshFailure: `Login retention is ${next ? "on" : "off"}, but this page could not be refreshed. Reopen the popup to continue.`,
                      }),
                    "Could not change login retention. Try again.",
                  )
                }
              />
            </label>
            <p
              id={retentionGuidance}
              className="text-sm leading-relaxed text-muted-foreground"
            >
              Keep this tab’s detected login for review until you save or
              dismiss it, close the tab, or lock the vault. Applies to new
              detections. Logins stay encrypted in browser memory. Turning this
              off clears logins waiting for review.
            </p>
          </div>
        </section>
      ) : null}
      <div className="flex items-center gap-2 text-sm font-medium">
        <HugeiconsIcon
          icon={Globe02Icon}
          size={18}
          className="shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="min-w-0 truncate">
          {target ? new URL(target.url).host : "This website"}
        </h2>
      </div>
      {target?.form ? (
        <div
          role="status"
          className="space-y-1 rounded-lg border border-border bg-card p-3"
        >
          <h3 className="text-sm font-semibold">
            {formLabels[target.form.kind]}
          </h3>
          <p className="text-sm text-muted-foreground">
            {target.form.fields.map((field) => fieldLabels[field]).join(" · ")}
          </p>
          {target.form.kind === "registration" ||
          target.form.kind === "password-change" ? (
            <p className="text-sm text-muted-foreground">
              Use Generator to create a new password. Saved passwords are not
              filled into new-password fields.
            </p>
          ) : null}
        </div>
      ) : data && mode === "detected" ? (
        <p className="text-sm text-muted-foreground">
          No sign-in or registration fields found.
        </p>
      ) : null}
      {mode === "detected" && captured ? (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">
              {data.updateEntryIds.length
                ? "Update saved password?"
                : captured.password
                  ? "Save this login?"
                  : "Save this email sign-in?"}
            </h3>
            <p className="break-all text-sm text-muted-foreground">
              {new URL(captured.url).host}
            </p>
            <p className="break-all text-sm text-muted-foreground">
              {captured.login || "Login without a username"}
            </p>
          </div>
          {!captured.password ? (
            <p className="text-sm text-muted-foreground">
              Save the email and website without a password.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {data.updateEntryIds.map((id) => (
              <Button
                key={id}
                size="sm"
                disabled={pending}
                onClick={() => void review(id)}
              >
                Review update
                {data.updateEntryIds.length > 1 ? ` · ${captured.login}` : ""}
              </Button>
            ))}
            <Button
              size="sm"
              variant={data.updateEntryIds.length ? "outline" : "default"}
              disabled={pending}
              onClick={() => void review()}
            >
              Review new login
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                void run(async (generation) => {
                  await capabilities.dismiss(
                    vaultId,
                    captured.tabId,
                    captured.id,
                  );
                  if (owner.current !== generation) return;
                  setData((current) =>
                    current
                      ? { ...current, captured: null, updateEntryIds: [] }
                      : current,
                  );
                }, "Could not dismiss this login. Try again.")
              }
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
      {mode === "matches" || (target?.fillable && !captured) ? (
        data?.entries.length ? (
          <ul className="space-y-2">
            {data.entries.map((entry) => (
              <li
                key={entry.id}
                className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {entry.login || "Login without a username"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new URL(entry.url).host}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !target?.fillable}
                  onClick={() => {
                    if (target)
                      void run(async (generation) => {
                        await capabilities.fill(vaultId, entry.id, target);
                        if (owner.current !== generation) return;
                        setFeedback(
                          "Login filled. Submit the form when you’re ready.",
                        );
                      }, "Could not fill this login. Reopen the page and try again.");
                  }}
                >
                  <HugeiconsIcon
                    icon={Login01Icon}
                    size={16}
                    aria-hidden="true"
                  />
                  Fill
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {data
              ? target
                ? "No saved logins for this website."
                : "Open a secure website to fill a login."
              : "Reading website…"}
          </p>
        )
      ) : !captured && data ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <h3 className="text-sm font-medium">No login waiting to be saved</h3>
        </div>
      ) : null}
      {mode === "matches" &&
      target &&
      !target.fillable &&
      Boolean(data?.entries.length) ? (
        <p className="text-xs text-muted-foreground">
          No supported login form found. Embedded or ambiguous forms need manual
          entry.
        </p>
      ) : null}
      {feedback ? (
        <p role="status" className="text-sm text-success">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
