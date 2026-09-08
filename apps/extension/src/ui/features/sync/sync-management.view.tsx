import { useState } from "react";
import { Button } from "@/ui/components/primitives/button";
import { GuidancePanel } from "@/ui/components/feedback/guidance-panel.view";
import { DestructiveConfirmation } from "@/ui/components/feedback/destructive-confirmation.view";
import type { SyncManagementState } from "./sync.type";

export function SyncManagement({
  state,
  location,
  busy = false,
  accessMissing = false,
  disabling = false,
  error,
  onDisable,
  onCompleteRevocation,
  onReviewEnrollment,
  onReviewRevocation,
}: {
  state: SyncManagementState;
  location: string;
  busy?: boolean;
  accessMissing?: boolean;
  disabling?: boolean;
  error?: string;
  onDisable: () => void;
  onCompleteRevocation: () => void;
  onReviewEnrollment: () => void;
  onReviewRevocation: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <div className="space-y-6">
      {state.providerCredentialRevocationPending ? (
        <GuidancePanel
          variant="warning"
          title="Revoke the previous access keys"
        >
          <p>
            Finish any pending upload with the replacement keys, then delete the
            previous sync keys in AWS IAM. Deactivation alone cannot complete
            verification. A removed device may still use those keys to read or
            overwrite stored vault files until you revoke them.
          </p>
          <p>
            Keep the replacement keys active. Verify removal on each device that
            still holds the previous keys.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://console.aws.amazon.com/iam/home#/users"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center rounded-md border border-current px-4"
            >
              Open IAM users
            </a>
            <Button
              disabled={busy || accessMissing}
              onClick={onCompleteRevocation}
            >
              Verify old keys are revoked
            </Button>
          </div>
        </GuidancePanel>
      ) : null}
      {!state.providerCredentialRevocationPending &&
      !state.syncRemovalPending ? (
        <details className="rounded-lg border p-5">
          <summary className="cursor-pointer font-medium">
            Previous access keys
          </summary>
          <div className="mt-4 space-y-4">
            <p className="max-w-[65ch] leading-7 text-muted-foreground">
              If another device completed key revocation, verify it here to
              clear any previous keys still stored on this device.
            </p>
            <Button
              variant="outline"
              disabled={busy || accessMissing}
              onClick={onCompleteRevocation}
            >
              Verify previous key removal
            </Button>
          </div>
        </details>
      ) : null}
      {state.syncRemovalPending ? (
        <GuidancePanel variant="warning" title="Finish disabling sync">
          <p>
            Sync removal was interrupted. Retry to finish removing the current
            remote snapshot and keep this device's local vault.
          </p>
        </GuidancePanel>
      ) : (
        <section
          className="space-y-4 rounded-lg border p-5"
          aria-label="Device access changes"
        >
          <h2 className="text-lg font-semibold">Device access changes</h2>
          <p className="max-w-[65ch] leading-7 text-muted-foreground">
            If another trusted device added or removed a device, review that
            change before syncing its vault updates.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={busy || accessMissing}
              onClick={onReviewEnrollment}
            >
              Review added devices
            </Button>
            <Button
              variant="outline"
              disabled={busy || accessMissing}
              onClick={onReviewRevocation}
            >
              Review removed devices
            </Button>
          </div>
        </section>
      )}
      <section
        className="space-y-4 rounded-lg border border-destructive/30 p-5"
        aria-label="Disable sync"
      >
        <h2 className="text-lg font-semibold">Disable sync</h2>
        <p className="max-w-[65ch] leading-7 text-muted-foreground">
          Keep this vault on this device only. Disabling sync removes the
          current remote snapshot and disconnects other trusted devices.
        </p>
        <Button
          variant="destructive"
          disabled={
            busy || accessMissing || state.providerCredentialRevocationPending
          }
          onClick={() => {
            setAcknowledged(false);
            setConfirm(true);
          }}
        >
          {state.syncRemovalPending ? "Retry disabling sync" : "Disable sync"}
        </Button>
      </section>
      <DestructiveConfirmation
        open={confirm}
        onOpenChange={setConfirm}
        action="Disable sync"
        identity={location}
        consequences="The current remote snapshot will be removed and other devices will lose access to future updates. This device keeps its local vault. Existing copies on other devices, S3 object versions and AWS access keys are not erased."
        acknowledgment="I have saved the vault data I need on this device."
        acknowledged={acknowledged}
        onAcknowledge={setAcknowledged}
        onConfirm={onDisable}
        pending={disabling}
        error={error}
      />
    </div>
  );
}
