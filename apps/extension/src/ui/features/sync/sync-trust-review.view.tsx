import { Button } from "@/ui/components/primitives/button";
import { GuidancePanel } from "@/ui/components/feedback/guidance-panel.view";
import { FormFrame, FormPassword } from "@/ui/components/forms/form-frame.view";
import { TextField } from "@/ui/components/forms/fields.view";
import type { CredentialDraft } from "./credential-form.view";
import type { TrustReview } from "./sync.type";
import { comparisonRows } from "./sync-review.mapper";
import { SyncReview, type Resolution } from "./sync-review.view";

export function SyncTrustReview({
  kind,
  review,
  value,
  choices,
  busy = false,
  applying = false,
  error,
  onChange,
  onChoose,
  onPrepare,
  onApply,
  onCancel,
}: {
  kind: "enrollment" | "revocation";
  review?: TrustReview;
  value: CredentialDraft;
  choices: Readonly<Record<string, Resolution>>;
  busy?: boolean;
  applying?: boolean;
  error?: string;
  onChange: (value: CredentialDraft) => void;
  onChoose: (id: string, value: Resolution) => void;
  onPrepare: () => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const items = review ? comparisonRows(review.result.review) : [];
  return (
    <section
      aria-label="Review device access changes"
      className="mx-auto max-w-3xl space-y-6 rounded-lg border p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {kind === "enrollment"
            ? "Review added devices"
            : "Review removed devices"}
        </h2>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Back to sync
        </Button>
      </div>
      {!review ? (
        <FormFrame
          onSubmit={onPrepare}
          onCancel={onCancel}
          state={busy ? "pending" : error ? "error" : "idle"}
          message={error}
          label="Load device changes"
          canSubmit={
            kind === "enrollment" ||
            Boolean(value.accessKeyId.trim() && value.secretAccessKey.trim())
          }
        >
          {kind === "revocation" ? (
            <>
              <GuidancePanel title="Replacement sync keys" variant="warning">
                <p>
                  Use the replacement keys from the trusted device that removed
                  access. Keep the same bucket and prefix. Do not use keys
                  belonging to the removed device.
                </p>
              </GuidancePanel>
              <TextField
                label="Access key ID"
                value={value.accessKeyId}
                onChange={(event) =>
                  onChange({ ...value, accessKeyId: event.target.value })
                }
                required
              />
              <FormPassword
                label="Secret access key"
                value={value.secretAccessKey}
                onChange={(secretAccessKey) =>
                  onChange({ ...value, secretAccessKey })
                }
              />
            </>
          ) : (
            <GuidancePanel title="Confirm the devices you trust">
              <p>
                Accept only device additions you or another trusted device owner
                authorized. The signed device changes and any accompanying vault
                edits will be shown for review.
              </p>
            </GuidancePanel>
          )}
        </FormFrame>
      ) : (
        <>
          <GuidancePanel title="Verified device changes" variant="warning">
            <dl className="space-y-3">
              <div>
                <dt className="font-medium">Added devices</dt>
                <dd className="break-all">
                  {review.result.enrolledDeviceIds.join(", ") || "None"}
                </dd>
              </div>
              {review.kind === "revocation" ? (
                <div>
                  <dt className="font-medium">Removed devices</dt>
                  <dd className="break-all">
                    {review.result.revokedDeviceIds.join(", ") || "None"}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p>
              Accepting updates this device's trusted device list. Review any
              vault changes below before continuing.
            </p>
          </GuidancePanel>
          {items.length ? (
            <SyncReview
              items={items}
              choices={choices}
              onChange={onChoose}
              onApply={onApply}
              state={applying ? "applying" : busy ? "loading" : "reviewing"}
            />
          ) : (
            <Button disabled={busy} onClick={onApply}>
              {applying ? "Accepting…" : "Accept device changes"}
            </Button>
          )}
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
