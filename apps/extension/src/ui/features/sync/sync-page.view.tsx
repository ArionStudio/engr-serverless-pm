import { S3SetupGuide } from "./s3-setup-guide.view";
import { Button } from "@/ui/components/primitives/button";
import { CredentialForm } from "./credential-form.view";
import { SyncReview, SyncStatus } from "./sync-review.view";
import type { SyncCapabilities } from "./sync.type";
import { comparisons } from "./sync-review.mapper";
import { useSync } from "./use-sync";

export function SyncPage({
  vaultId,
  capabilities,
  onBack,
}: {
  vaultId: string;
  capabilities: SyncCapabilities;
  onBack: () => void;
}) {
  const sync = useSync(vaultId, capabilities);
  const busy = !!sync.operation;
  const items = sync.review ? comparisons(sync.review) : [];
  const form = sync.target === null || sync.repairing;
  function connection(onEditLocation?: () => void) {
    return (
      <CredentialForm
        key={sync.generation}
        mode={sync.repairing ? "repair" : "setup"}
        value={sync.draft}
        onChange={sync.change}
        onEditLocation={onEditLocation}
        feedback={sync.feedback ? <SyncStatus {...sync.feedback} /> : undefined}
        message={sync.error}
        onSubmit={() => void sync.save()}
        onCancel={() => {
          sync.cancel();
          if (!busy && !sync.repairing) onBack();
        }}
        onTest={() => void sync.test()}
        testing={sync.operation === "test"}
        state={busy ? "pending" : sync.error ? "error" : "idle"}
      />
    );
  }
  return (
    <section className="space-y-6" aria-label="Sync">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Sync</h1>
        <Button variant="ghost" disabled={busy} onClick={onBack}>
          Back to vault
        </Button>
      </div>
      {sync.error && !form ? (
        <p role="alert" className="text-sm text-destructive">
          {sync.error}
        </p>
      ) : null}
      {sync.target === undefined ? (
        sync.error ? (
          <Button onClick={() => void sync.refresh()} disabled={busy}>
            Try again
          </Button>
        ) : (
          <p role="status">Loading sync configuration…</p>
        )
      ) : null}
      {sync.target ? (
        <dl className="grid gap-4 rounded-lg border p-4 text-sm">
          {(["bucket", "region", "prefix"] as const).map((key) => (
            <div key={key}>
              <dt className="text-muted-foreground">
                {
                  {
                    bucket: "Bucket",
                    region: "Region",
                    prefix: "Object prefix",
                  }[key]
                }
              </dt>
              <dd className="mt-1 break-all">{sync.target?.[key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {sync.accessMissing && !form ? (
        <SyncStatus
          state="permission-required"
          detail="Allow this browser to connect to your S3 storage. Your local vault remains available."
        />
      ) : sync.feedback && !form ? (
        <SyncStatus {...sync.feedback} />
      ) : sync.target && !form && !sync.error ? (
        <SyncStatus
          state="not-checked"
          detail="Sync is configured. Check for remote changes or upload local changes."
        />
      ) : null}
      {form ? (
        sync.repairing ? (
          <div className="s3-setup-guide mx-auto max-w-3xl">{connection()}</div>
        ) : (
          <S3SetupGuide
            key={`${vaultId}:${sync.generation}`}
            location={{
              bucket: sync.draft.bucket,
              region: sync.draft.region,
              prefix: sync.draft.prefix,
            }}
            onLocationChange={(location) =>
              sync.change({ ...sync.draft, ...location })
            }
            onCopy={capabilities.copySetupText}
            busy={busy}
            connection={connection}
          />
        )
      ) : sync.target ? (
        <div className="flex flex-wrap gap-3">
          {sync.accessMissing ? (
            <Button disabled={busy} onClick={() => void sync.allowAccess()}>
              {sync.operation === "permission"
                ? "Requesting access…"
                : "Allow storage access"}
            </Button>
          ) : null}
          <Button
            disabled={busy || sync.accessMissing}
            onClick={() => void sync.check()}
          >
            {sync.operation === "review" ? "Checking…" : "Check sync"}
          </Button>
          <Button
            variant="outline"
            disabled={busy || sync.accessMissing}
            onClick={() => void sync.upload()}
          >
            {sync.operation === "upload" ? "Uploading…" : "Retry upload"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={sync.beginRepair}>
            Replace access keys
          </Button>
        </div>
      ) : null}
      {sync.review?.review ? (
        items.length ? (
          <SyncReview
            items={items}
            choices={sync.choices}
            onChange={sync.choose}
            onApply={() => void sync.apply()}
            state={
              sync.operation === "apply"
                ? "applying"
                : busy
                  ? "loading"
                  : "reviewing"
            }
          />
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              {sync.review.review.readOnly.providerCredentialRevocationCompleted
                ? "The remote vault records that the previous access keys were revoked."
                : "The remote vault has a newer verified revision with no entry, tag or device-name changes."}
            </p>
            <Button disabled={busy} onClick={() => void sync.apply()}>
              Accept remote revision
            </Button>
          </div>
        )
      ) : null}
    </section>
  );
}
