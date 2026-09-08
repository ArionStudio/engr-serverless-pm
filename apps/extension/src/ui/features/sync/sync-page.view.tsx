import { SyncAccessKeys } from "./sync-access-keys.view";
import { SyncManagement } from "./sync-management.view";
import { SyncTrustReview } from "./sync-trust-review.view";
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
  onSessionLost,
}: {
  vaultId: string;
  capabilities: SyncCapabilities;
  onBack: () => void;
  onSessionLost?: () => void;
}) {
  const sync = useSync(vaultId, capabilities, onSessionLost);
  const busy = !!sync.operation;
  const items = sync.review ? comparisons(sync.review) : [];
  const form = sync.target === null || sync.repairing;
  const managing = !form && !sync.trustMode;
  function connection(onEditLocation?: () => void) {
    const occupiedTarget =
      sync.errorKind === "target-occupied" && sync.error && onEditLocation ? (
        <SyncStatus
          state="target-occupied"
          detail={sync.error}
          action="Change object prefix"
          onAction={onEditLocation}
        />
      ) : undefined;
    return (
      <CredentialForm
        key={sync.generation}
        mode={
          sync.repairing
            ? "repair"
            : sync.existingConnection
              ? "connect-existing"
              : "setup"
        }
        value={sync.draft}
        onChange={sync.change}
        onEditLocation={onEditLocation}
        feedback={
          occupiedTarget ??
          (sync.feedback ? <SyncStatus {...sync.feedback} /> : undefined)
        }
        message={occupiedTarget ? undefined : sync.error}
        onSubmit={() =>
          void (sync.existingConnection ? sync.connectExisting() : sync.save())
        }
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
      {sync.error && managing ? (
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
      {sync.accessMissing && managing ? (
        <SyncStatus
          state="permission-required"
          detail="Allow this browser to connect to your S3 storage. Your local vault remains available."
        />
      ) : sync.feedback &&
        !sync.trustMode &&
        (!form || sync.feedback.state === "unconfigured") ? (
        <SyncStatus {...sync.feedback} />
      ) : sync.target && managing && !sync.error ? (
        <SyncStatus
          state="not-checked"
          detail="Sync is configured. Check for remote changes or upload local changes."
        />
      ) : null}
      {sync.trustMode ? (
        <SyncTrustReview
          key={sync.generation}
          kind={sync.trustMode}
          review={sync.trustReview}
          value={sync.draft}
          choices={sync.choices}
          busy={busy}
          applying={sync.operation === "trust-apply"}
          error={sync.error}
          onChange={sync.change}
          onChoose={sync.choose}
          onPrepare={() => void sync.prepareTrust()}
          onApply={() => void sync.acceptTrust()}
          onCancel={sync.cancel}
        />
      ) : form ? (
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
            access={capabilities}
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
            disabled={
              busy || sync.accessMissing || sync.management?.syncRemovalPending
            }
            onClick={() => void sync.check()}
          >
            {sync.operation === "review" ? "Checking…" : "Check sync"}
          </Button>
          <Button
            variant="outline"
            disabled={
              busy || sync.accessMissing || sync.management?.syncRemovalPending
            }
            onClick={() => void sync.upload()}
          >
            {sync.operation === "upload" ? "Uploading…" : "Retry upload"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy || sync.management?.syncRemovalPending}
            onClick={sync.beginRepair}
          >
            Replace access keys
          </Button>
        </div>
      ) : null}
      {sync.target &&
      managing &&
      !busy &&
      !sync.management?.syncRemovalPending ? (
        <SyncAccessKeys
          key={`${vaultId}:${sync.generation}`}
          vaultId={vaultId}
          capabilities={capabilities}
        />
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
                : "The remote vault has a newer verified revision with no entry, tag, folder or device-name changes."}
            </p>
            <Button disabled={busy} onClick={() => void sync.apply()}>
              Accept remote revision
            </Button>
          </div>
        )
      ) : null}
      {sync.target && managing && sync.management ? (
        <SyncManagement
          state={sync.management}
          location={`${sync.target.bucket}/${sync.target.prefix}`}
          busy={busy}
          accessMissing={sync.accessMissing}
          disabling={sync.operation === "disable"}
          error={sync.error}
          onDisable={() => void sync.disable()}
          onCompleteRevocation={() => void sync.completeCredentialRevocation()}
          onReviewEnrollment={() => sync.beginTrust("enrollment")}
          onReviewRevocation={() => sync.beginTrust("revocation")}
        />
      ) : null}
    </section>
  );
}
