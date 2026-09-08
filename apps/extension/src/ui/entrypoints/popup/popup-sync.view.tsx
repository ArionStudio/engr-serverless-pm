import { HugeiconsIcon } from "@hugeicons/react";
import { CloudIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/ui/components/primitives/button";
import { Spinner } from "@/ui/components/primitives/spinner";
import { SyncReview } from "@/ui/features/sync/sync-review.view";
import { comparisons } from "@/ui/features/sync/sync-review.mapper";
import { cn } from "cn";
import { usePopupSync } from "./use-popup-sync";
import type { PopupSyncCapabilities } from "./popup-sync.type";

export function PopupSync({
  vaultId,
  capabilities,
  disabled = false,
  onOpenOptions,
}: {
  vaultId: string;
  capabilities: PopupSyncCapabilities;
  disabled?: boolean;
  onOpenOptions: () => void;
}) {
  const sync = usePopupSync(vaultId, capabilities);
  const working = sync.status === "loading" || sync.status === "checking";
  const title = {
    loading: "Reading sync status…",
    off: "Sync is off",
    permission: "Storage access needed",
    unchecked: "Sync not checked",
    checking: "Checking S3…",
    current: "Up to date with S3",
    review: "Remote changes to review",
    upload: "Local changes to upload",
    pending: "Upload pending",
    error: "Sync needs attention",
  }[sync.status];
  const items = sync.review ? comparisons(sync.review) : [];
  const configure = sync.status === "off" || sync.status === "permission";
  return (
    <section
      aria-label="Vault sync"
      className="mb-4 rounded-lg border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p
          role="status"
          className={cn(
            "flex min-w-0 items-center gap-2 text-sm font-medium",
            sync.status === "error" && "text-destructive",
          )}
        >
          {working ? (
            <Spinner className="size-4 shrink-0" />
          ) : (
            <HugeiconsIcon
              icon={CloudIcon}
              size={18}
              aria-hidden="true"
              className="shrink-0 text-primary"
            />
          )}
          {title}
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || working}
          onClick={configure ? onOpenOptions : () => void sync.check()}
        >
          {!configure && (
            <HugeiconsIcon icon={RefreshIcon} size={16} aria-hidden="true" />
          )}
          {configure
            ? "Configure sync"
            : sync.status === "upload" || sync.status === "pending"
              ? "Retry upload"
              : "Sync now"}
        </Button>
      </div>
      {sync.error && (
        <div role="alert" className="mt-2 space-y-2 text-sm text-destructive">
          <p>{sync.error}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || working}
            onClick={onOpenOptions}
          >
            Sync settings
          </Button>
        </div>
      )}
      {sync.snapshot && (
        <details className="mt-2 text-xs">
          <summary className="w-fit cursor-pointer rounded-sm py-1 text-muted-foreground">
            Version vector
          </summary>
          <table className="mt-2 w-full table-fixed text-left">
            <thead>
              <tr>
                <th className="pb-1 font-medium">Device ID</th>
                <th className="w-20 pb-1 text-right font-medium">Revision</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(sync.snapshot.version).map(
                ([device, revision]) => (
                  <tr key={device}>
                    <td className="break-all py-1 pr-3 font-mono">{device}</td>
                    <td className="py-1 text-right tabular-nums">{revision}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </details>
      )}
      {sync.review?.review && (
        <details className="mt-2 border-t pt-2 text-sm">
          <summary className="w-fit cursor-pointer rounded-sm py-1 font-medium">
            Review changes
          </summary>
          <fieldset className="mt-3" disabled={disabled || working}>
            {items.length ? (
              <SyncReview
                items={items}
                choices={sync.choices}
                onChange={sync.choose}
                onApply={() => void sync.apply()}
                state="reviewing"
              />
            ) : (
              <Button
                disabled={disabled || working}
                onClick={() => void sync.apply()}
              >
                Apply verified snapshot
              </Button>
            )}
          </fieldset>
        </details>
      )}
    </section>
  );
}
