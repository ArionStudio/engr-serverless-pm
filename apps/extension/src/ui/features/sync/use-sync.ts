import { useEffect, useRef, useState } from "react";
import type { PrepareSyncReviewResult, SyncUploadResult } from "@lfspm/core";
import type { CredentialDraft } from "./credential-form.view";
import type { SyncCapabilities, SyncLocation } from "./sync.type";
import { emptyCredentials } from "./sync.type";
import { syncError } from "./sync-error";
import type { Resolution, SyncDisplayState } from "./sync-review.view";
import { resolutionFromChoices } from "./sync-review.mapper";

type Operation =
  | "test"
  | "configure"
  | "repair"
  | "upload"
  | "review"
  | "apply";
export function useSync(vaultId: string, capabilities: SyncCapabilities) {
  const [target, setTarget] = useState<SyncLocation | null>();
  const [draft, setDraft] = useState<CredentialDraft>({ ...emptyCredentials });
  const [repairing, setRepairing] = useState(false);
  const [operation, setOperation] = useState<Operation>();
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState<{
    state: SyncDisplayState;
    detail: string;
  }>();
  const [review, setReview] = useState<PrepareSyncReviewResult>();
  const [choices, setChoices] = useState<Record<string, Resolution>>({});
  const [generation, setGeneration] = useState(0);
  const epoch = useRef(0);
  const busy = useRef(false);
  const inspectEpoch = useRef(0);
  function clearSecrets() {
    setDraft({ ...emptyCredentials });
    setRepairing(false);
    setGeneration((n) => n + 1);
  }
  useEffect(() => {
    const lifecycle = epoch;
    const inspections = inspectEpoch;
    ++lifecycle.current;
    busy.current = false;
    async function inspect(hard: boolean) {
      const inspection = ++inspectEpoch.current;
      if (hard) {
        ++epoch.current;
        busy.current = false;
        setOperation(undefined);
        clearSecrets();
        setTarget(undefined);
        setReview(undefined);
        setChoices({});
        setFeedback(undefined);
      }
      const owner = epoch.current;
      try {
        const next = await capabilities.inspect(vaultId);
        if (owner === epoch.current && inspection === inspectEpoch.current)
          setTarget(next);
      } catch (cause) {
        if (owner !== epoch.current || inspection !== inspectEpoch.current)
          return;
        ++epoch.current;
        busy.current = false;
        setOperation(undefined);
        clearSecrets();
        setReview(undefined);
        setChoices({});
        setTarget(undefined);
        setFeedback(undefined);
        setError(syncError(cause));
      }
    }
    void inspect(false);
    const unsubscribe = capabilities.subscribe(
      (reason) => void inspect(reason === "session"),
    );
    return () => {
      unsubscribe();
      ++lifecycle.current;
      ++inspections.current;
      busy.current = false;
    };
  }, [vaultId, capabilities]);

  async function run(kind: Operation, task: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    const current = epoch.current;
    ++inspectEpoch.current;
    setOperation(kind);
    setError(undefined);
    try {
      await task();
    } catch (cause) {
      if (current !== epoch.current) return;
      setError(syncError(cause));
      setFeedback(undefined);
      setReview(undefined);
      setChoices({});
      // Setup may have committed locally before a provider error was observed.
      try {
        const next = await capabilities.inspect(vaultId);
        if (current === epoch.current) {
          setTarget(next);
          if (next) clearSecrets();
        }
      } catch {
        if (current === epoch.current) {
          clearSecrets();
          setTarget(undefined);
        }
      }
    } finally {
      if (current === epoch.current) {
        ++inspectEpoch.current;
        busy.current = false;
        setOperation(undefined);
      }
    }
  }
  function uploaded(result: SyncUploadResult) {
    setFeedback(
      result.syncUpload === "complete"
        ? {
            state: "complete",
            detail: "The encrypted vault is up to date in S3.",
          }
        : {
            state: "pending",
            detail:
              "Saved on this device. The upload is not confirmed. Retry when you have a connection.",
          },
    );
  }
  return {
    target,
    draft,
    repairing,
    operation,
    error,
    feedback,
    review,
    choices,
    generation,
    change: (value: CredentialDraft) => {
      setDraft(value);
      setError(undefined);
      setFeedback(undefined);
    },
    choose: (id: string, value: Resolution) =>
      setChoices((previous) => ({ ...previous, [id]: value })),
    beginRepair: () => {
      if (!target || busy.current) return;
      setDraft({ ...emptyCredentials, ...target });
      setRepairing(true);
      setReview(undefined);
      setChoices({});
      setError(undefined);
      setFeedback(undefined);
    },
    cancel: () => {
      if (busy.current) return;
      clearSecrets();
      setError(undefined);
      setFeedback(undefined);
    },
    refresh: () =>
      run("review", async () => {
        const current = epoch.current;
        const next = await capabilities.inspect(vaultId);
        if (current === epoch.current) setTarget(next);
      }),
    test: () =>
      run("test", async () => {
        const current = epoch.current;
        await capabilities.test(vaultId, { ...draft });
        if (current === epoch.current)
          setFeedback({
            state: "access-confirmed",
            detail:
              "Read access confirmed. Enabling sync also requires permission to upload to this location.",
          });
      }),
    save: () =>
      run(repairing ? "repair" : "configure", async () => {
        const current = epoch.current;
        const input = { ...draft };
        const result = repairing
          ? await capabilities.repair(vaultId, input)
          : await capabilities.configure(vaultId, input);
        if (current !== epoch.current) return;
        clearSecrets();
        if (result) uploaded(result);
        else
          setFeedback({
            state: "not-checked",
            detail:
              "Access keys updated on this device. Check sync or retry an outstanding upload.",
          });
        const next = await capabilities.inspect(vaultId);
        if (current === epoch.current) setTarget(next);
      }),
    upload: () =>
      run("upload", async () => {
        const current = epoch.current;
        const result = await capabilities.upload(vaultId);
        if (current === epoch.current) {
          uploaded(result);
          setReview(undefined);
          setChoices({});
        }
      }),
    check: () =>
      run("review", async () => {
        const current = epoch.current;
        setReview(undefined);
        setChoices({});
        const result = await capabilities.review(vaultId);
        if (current !== epoch.current) return;
        setReview(result);
        setFeedback(
          result.review
            ? {
                state: "review-required",
                detail: "Review the remote changes before applying them.",
              }
            : {
                state: "complete",
                detail: "This device and S3 have the same verified vault.",
              },
        );
      }),
    apply: () =>
      run("apply", async () => {
        if (!review?.review) return;
        const current = epoch.current;
        const result = await capabilities.apply({
          vaultId,
          reviewedSnapshotIdentities: review.reviewedSnapshotIdentities,
          resolution: resolutionFromChoices(review, choices),
        });
        if (current === epoch.current) {
          uploaded(result);
          setReview(undefined);
          setChoices({});
        }
      }),
  };
}
