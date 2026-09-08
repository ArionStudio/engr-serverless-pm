import { Switch } from "@/ui/components/primitives/switch";
import { useEffect, useId, useRef, useState } from "react";
import type { BrowserLogins, CapturedLogin } from "@lfspm/core";
import type { BrowserLoginCapabilities } from "./browser-login.type";
import { Button } from "@/ui/components/primitives/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Globe02Icon, Login01Icon } from "@hugeicons/core-free-icons";

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
}: {
  mode?: "matches" | "detected";
  onPendingChange?: (pending: boolean) => void;
  vaultId: string;
  capabilities: BrowserLoginCapabilities;
  onReview: (captured: CapturedLogin, entryId?: string) => void;
}) {
  const [data, setData] = useState<BrowserLogins>();
  const [enabled, setEnabled] = useState<boolean>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const owner = useRef(0);
  const detectionLabel = useId();
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  useEffect(() => {
    const generation = ++owner.current;
    void capabilities.read(vaultId).then(
      (result) => {
        if (owner.current === generation) setData(result);
      },
      () => {
        if (owner.current === generation)
          setError("Could not read this page. Reopen the popup to try again.");
      },
    );
    if (mode === "detected")
      void capabilities.detectionEnabled().then(
        (detection) => {
          if (owner.current === generation) setEnabled(detection);
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
    };
  }, [vaultId, capabilities, mode]);
  // Recheck the short-lived capture before putting its password into an editor.
  async function review(entryId?: string) {
    await run(async () => {
      const fresh = await capabilities.read(vaultId);
      if (!fresh.captured || fresh.captured.id !== data?.captured?.id)
        throw new Error(
          "This captured login expired. Sign in on the website again to save it.",
        );
      onReview(fresh.captured, entryId);
    });
  }
  async function run(operation: () => Promise<void>) {
    if (pending) return;
    const generation = owner.current;
    setPending(true);
    setError(undefined);
    setFeedback(undefined);
    try {
      await operation();
    } catch (cause) {
      if (owner.current === generation)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not complete this action.",
        );
    } finally {
      if (owner.current === generation) setPending(false);
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
                  void run(async () => {
                    await capabilities.setDetection(next);
                    setEnabled(next);
                    setData(await capabilities.read(vaultId));
                  })
                }
              />
            </span>
          </label>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Recognize sign-in and registration fields, and offer to save website
            logins while your vault is unlocked. You review each login before
            saving it.
          </p>
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
                {data.updateEntryIds.length > 1
                  ? ` · ${data.entries.find((entry) => entry.id === id)?.login}`
                  : ""}
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
                void run(async () => {
                  await capabilities.dismiss(
                    vaultId,
                    captured.tabId,
                    captured.id,
                  );
                  setData((current) =>
                    current
                      ? { ...current, captured: null, updateEntryIds: [] }
                      : current,
                  );
                })
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
                      void run(async () => {
                        await capabilities.fill(vaultId, entry.id, target);
                        setFeedback(
                          "Login filled. Submit the form when you’re ready.",
                        );
                      });
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
