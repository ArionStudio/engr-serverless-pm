import { useCallback, useEffect, useRef, useState } from "react";
import type { PrepareSyncReviewResult } from "@lfspm/core";
import { syncError } from "@/ui/features/sync/sync-error";
import { resolutionFromChoices } from "@/ui/features/sync/sync-review.mapper";
import type { Resolution } from "@/ui/features/sync/sync-review.view";
import type {
  PopupSyncCapabilities,
  PopupSyncSnapshot,
} from "./popup-sync.type";

type Status =
  | "loading"
  | "off"
  | "permission"
  | "unchecked"
  | "checking"
  | "current"
  | "review"
  | "upload"
  | "pending"
  | "error";
export function usePopupSync(
  vaultId: string,
  capabilities: PopupSyncCapabilities,
) {
  const [snapshot, setSnapshot] = useState<PopupSyncSnapshot>();
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string>();
  const [review, setReview] = useState<PrepareSyncReviewResult>();
  const [choices, setChoices] = useState<Record<string, Resolution>>({});
  const epoch = useRef(0);
  const busy = useRef(false);
  const inspection = useRef(0);
  const dataRevision = useRef(0);
  const inspectedRevision = useRef(0);
  const read = useCallback(
    async (owner: number) => {
      const request = ++inspection.current;
      inspectedRevision.current = dataRevision.current;
      const value = await capabilities.inspect(vaultId);
      if (owner === epoch.current && request === inspection.current)
        setSnapshot(value);
      return value;
    },
    [capabilities, vaultId],
  );
  const run = useCallback(
    async (
      action: "check" | "upload" | "apply",
      prepared?: PrepareSyncReviewResult,
      selected: Record<string, Resolution> = {},
    ) => {
      if (busy.current) return;
      busy.current = true;
      const owner = epoch.current;
      setStatus("checking");
      setError(undefined);
      setReview(undefined);
      setChoices({});
      let completed: "complete" | "pending" | undefined;
      try {
        const local = await read(owner);
        if (owner !== epoch.current) return;
        if (!local.configured || !local.access || local.removalPending) {
          setStatus(
            !local.configured ? "off" : !local.access ? "permission" : "error",
          );
          if (local.removalPending)
            setError("Sync removal is pending. Finish it in Options.");
          return;
        }
        if (action === "apply" && !prepared?.review) return;
        if (action === "upload" || action === "apply") {
          const result =
            action === "upload"
              ? await capabilities.upload(vaultId)
              : await capabilities.apply({
                  vaultId,
                  reviewedSnapshotIdentities:
                    prepared!.reviewedSnapshotIdentities,
                  resolution: resolutionFromChoices(prepared!, selected),
                });
          if (owner !== epoch.current) return;
          completed = result.syncUpload;
          await read(owner);
          if (owner !== epoch.current) return;
          if (result.syncUpload === "pending") {
            setStatus("pending");
            return;
          }
        }
        const result = await capabilities.review(vaultId);
        if (owner !== epoch.current) return;
        const latest = await read(owner);
        if (owner !== epoch.current) return;
        const reviewed =
          result.reviewedSnapshotIdentities.local.descriptor
            .snapshotVersionVector;
        if (
          Object.keys(reviewed).length !== Object.keys(latest.version).length ||
          Object.entries(reviewed).some(
            ([id, value]) => latest.version[id] !== value,
          )
        ) {
          setStatus("unchecked");
          return;
        }
        setReview(result);
        setStatus(result.review ? "review" : "current");
      } catch (cause) {
        if (owner !== epoch.current) return;
        if (completed) {
          setSnapshot(undefined);
          setStatus(completed === "pending" ? "pending" : "unchecked");
          const outcome =
            completed === "pending"
              ? "Upload is still pending."
              : action === "apply"
                ? "Changes applied and uploaded."
                : "Upload completed.";
          setError(
            `${outcome} Sync status could not be refreshed. Check sync again.`,
          );
          return;
        }
        if (
          cause instanceof Error &&
          cause.name === "LocalVaultSnapshotAheadError"
        )
          setStatus("upload");
        else {
          setStatus("error");
          setError(syncError(cause, action === "check" ? "review" : action));
        }
      } finally {
        if (owner === epoch.current) {
          busy.current = false;
          if (inspectedRevision.current !== dataRevision.current) {
            setSnapshot(undefined);
            setReview(undefined);
            setChoices({});
            setStatus((current) =>
              current === "current" ||
              current === "review" ||
              current === "upload" ||
              current === "checking"
                ? "unchecked"
                : current,
            );
          }
        }
      }
    },
    [capabilities, vaultId, read],
  );
  useEffect(() => {
    const lifecycle = epoch;
    ++epoch.current;
    busy.current = false;
    void run("check");
    const unsubscribe = capabilities.subscribe((reason) => {
      if (reason === "focus") return;
      if (reason === "session") {
        ++epoch.current;
        busy.current = false;
        setSnapshot(undefined);
        setReview(undefined);
        setChoices({});
        setStatus("error");
        setError("Unlock the vault to check sync.");
        return;
      }
      ++dataRevision.current;
      if (busy.current) return;
      const owner = epoch.current;
      const pendingInspection = read(owner);
      const request = inspection.current;
      void pendingInspection.then(
        (value) => {
          if (
            owner !== epoch.current ||
            request !== inspection.current ||
            busy.current
          )
            return;
          setStatus(
            value.configured
              ? value.access
                ? "unchecked"
                : "permission"
              : "off",
          );
          setReview(undefined);
          setChoices({});
          setError(undefined);
        },
        () => {
          if (owner === epoch.current && request === inspection.current) {
            setSnapshot(undefined);
            setReview(undefined);
            setChoices({});
            setStatus("error");
            setError("Could not read sync status. Try again.");
          }
        },
      );
    });
    return () => {
      ++lifecycle.current;
      busy.current = false;
      unsubscribe();
    };
  }, [capabilities, run, read]);
  return {
    snapshot,
    status,
    error,
    review,
    choices,
    check: () =>
      run(status === "upload" || status === "pending" ? "upload" : "check"),
    apply: () =>
      review?.review ? run("apply", review, choices) : Promise.resolve(),
    choose: (id: string, value: Resolution) =>
      setChoices((previous) => ({ ...previous, [id]: value })),
  };
}
