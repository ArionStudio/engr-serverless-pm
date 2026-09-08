import { useEffect, useRef, useState } from "react";
import { vaultAuthorizationWasLost } from "@/ui/lib/vault-authorization";
import { Button } from "@/ui/components/primitives/button";
import { FormFrame, FormPassword } from "@/ui/components/forms/form-frame.view";
import { CopyAction } from "@/ui/components/feedback/action-feedback.view";
import type { OperationState } from "@/ui/components/forms/form-state.type";
import type { RevealedSyncKeys, SyncCapabilities } from "./sync.type";

const revealDurationMs = 30_000;

export function SyncAccessKeys({
  vaultId,
  capabilities,
}: {
  vaultId: string;
  capabilities: Pick<
    SyncCapabilities,
    "revealAccessKeys" | "copyAccessKey" | "subscribe" | "inspectManagement"
  >;
}) {
  const [opened, setOpened] = useState(false);
  const [password, setPassword] = useState("");
  const [keys, setKeys] = useState<RevealedSyncKeys | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [copyState, setCopyState] = useState<{
    field: string;
    state: OperationState;
  }>();
  const generation = useRef(0);
  const expiresAt = useRef(0);

  function hide() {
    generation.current += 1;
    expiresAt.current = 0;
    setKeys(null);
    setPassword("");
    setOpened(false);
    setPending(false);
    setError(undefined);
    setCopyState(undefined);
  }

  useEffect(() => {
    const unsubscribe = capabilities.subscribe((reason) => {
      if (reason === "session" || reason === "pagehide") hide();
    });
    const onHidden = () => {
      if (document.hidden) hide();
    };
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      generation.current += 1;
      expiresAt.current = 0;
      unsubscribe();
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [vaultId, capabilities]);

  useEffect(() => {
    if (!keys) return;
    const timer = window.setTimeout(
      hide,
      Math.max(0, expiresAt.current - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [keys]);

  async function reveal() {
    if (pending || !password) return;
    const request = ++generation.current;
    setPending(true);
    setError(undefined);
    const enteredPassword = password;
    setPassword("");
    try {
      const revealed = await capabilities.revealAccessKeys(
        vaultId,
        enteredPassword,
      );
      if (request !== generation.current) return;
      expiresAt.current = Date.now() + revealDurationMs;
      setKeys(revealed);
    } catch {
      if (request === generation.current)
        setError(
          "Could not reveal access keys. Check this device's vault password and try again.",
        );
    } finally {
      if (request === generation.current) setPending(false);
    }
  }

  async function copy(field: "accessKeyId" | "secretAccessKey") {
    if (!keys || Date.now() >= expiresAt.current) {
      hide();
      return;
    }
    if (copyState?.state === "pending") return;
    const request = generation.current;
    setCopyState({ field, state: "pending" });
    try {
      await capabilities.copyAccessKey(vaultId, keys.sessionId, keys[field]);
      if (request === generation.current)
        setCopyState({ field, state: "success" });
    } catch (cause) {
      if (request !== generation.current) return;
      const lost = await vaultAuthorizationWasLost(cause, () =>
        capabilities.inspectManagement(vaultId),
      );
      if (request !== generation.current) return;
      if (lost) {
        hide();
        setError(
          "Access keys were hidden because vault access could not be verified. Unlock the vault and reveal them again.",
        );
      } else {
        setCopyState({ field, state: "error" });
      }
    }
  }

  return (
    <section
      aria-label="Sync access keys"
      className="@container/access-keys max-w-3xl space-y-5 rounded-xl border bg-card p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Access keys</h2>
        {opened ? (
          <Button variant="ghost" onClick={hide}>
            {keys ? "Hide access keys" : "Cancel"}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setError(undefined);
              setOpened(true);
            }}
          >
            Show sync access keys
          </Button>
        )}
      </div>
      {!opened && error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!opened ? (
        <p className="text-sm text-muted-foreground">
          Reveal or copy this device's S3 access keys using your vault password.
        </p>
      ) : keys ? (
        <>
          <dl className="space-y-4">
            {(["accessKeyId", "secretAccessKey"] as const).map((field) => (
              <div key={field} className="space-y-2">
                <dt className="text-sm font-medium">
                  {field === "accessKeyId"
                    ? "Access key ID"
                    : "Secret access key"}
                </dt>
                <dd className="flex flex-col items-start gap-3 rounded-lg border bg-background p-3 @sm/access-keys:flex-row @sm/access-keys:items-center">
                  <code className="min-w-0 flex-1 break-all text-sm select-all">
                    {keys[field]}
                  </code>
                  <CopyAction
                    label={
                      field === "accessKeyId"
                        ? "Copy access key ID"
                        : "Copy secret access key"
                    }
                    state={
                      copyState?.field === field ? copyState.state : "idle"
                    }
                    onCopy={() => void copy(field)}
                  />
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            Keys hide after 30 seconds or when you leave this screen. Copied
            keys are cleared from the clipboard after 30 seconds when possible.
            Clipboard history may keep a copy.
          </p>
          <p className="text-sm text-muted-foreground">
            Reusing these keys on another device links their S3 access. Revoking
            the keys affects both devices.
          </p>
        </>
      ) : (
        <FormFrame
          onSubmit={() => void reveal()}
          onCancel={hide}
          label="Reveal access keys"
          canSubmit={!!password}
          state={pending ? "pending" : error ? "error" : "idle"}
          message={error}
          actions={
            <Button type="submit" disabled={pending || !password}>
              {pending ? "Verifying…" : "Reveal access keys"}
            </Button>
          }
        >
          <FormPassword
            label="Vault password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            description="Enter this device's password to reveal the stored S3 keys."
          />
        </FormFrame>
      )}
    </section>
  );
}
