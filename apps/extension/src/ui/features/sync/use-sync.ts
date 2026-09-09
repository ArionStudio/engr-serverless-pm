import { useCallback, useEffect, useRef, useState } from "react";
import { vaultAuthorizationWasLost } from "@/ui/lib/vault-authorization";
import type {
  PrepareExistingSyncConnectionResult,
  PrepareSyncReviewResult,
  SyncUploadResult,
} from "@lfspm/core";
import type { CredentialDraft } from "./credential-form.view";
import type {
  SyncCapabilities,
  SyncLocation,
  SyncManagementState,
  TrustReview,
} from "./sync.type";
import { emptyCredentials } from "./sync.type";
import {
  isOccupiedSyncTargetError,
  syncError,
  type SyncErrorOperation,
} from "./sync-error";
import type { Resolution, SyncDisplayState } from "./sync-review.view";
import {
  resolutionFromChoices,
  resolutionFromReview,
} from "./sync-review.mapper";

export type StorageAccessState = "allowed" | "missing" | "unknown";

type SyncInspection = {
  target: SyncLocation | null;
  accessState: StorageAccessState;
};

async function inspectConfiguration(
  vaultId: string,
  capabilities: SyncCapabilities,
): Promise<SyncInspection> {
  // Failure of the authorized session read must still reach the caller's cleanup.
  const target = await capabilities.inspect(vaultId);
  if (!target) return { target, accessState: "allowed" };
  try {
    return {
      target,
      accessState: (await capabilities.hasAccess(target))
        ? "allowed"
        : "missing",
    };
  } catch {
    return { target, accessState: "unknown" };
  }
}

type Operation = SyncErrorOperation;
export function useSync(
  vaultId: string,
  capabilities: SyncCapabilities,
  onSessionLost?: () => void,
) {
  const [target, setTarget] = useState<SyncLocation | null>();
  const [draft, setDraft] = useState<CredentialDraft>({ ...emptyCredentials });
  const [repairing, setRepairing] = useState(false);
  const [existingConnection, setExistingConnection] =
    useState<PrepareExistingSyncConnectionResult>();
  const [management, setManagement] = useState<SyncManagementState>();
  const [trustMode, setTrustMode] = useState<"enrollment" | "revocation">();
  const [trustReview, setTrustReview] = useState<TrustReview>();
  const [accessState, setAccessState] = useState<StorageAccessState>("unknown");
  const [operation, setOperation] = useState<Operation>();
  const [error, setError] = useState<string>();
  const [errorKind, setErrorKind] = useState<"target-occupied">();
  const [refreshError, setRefreshError] = useState<string>();
  const [feedback, setFeedback] = useState<{
    state: SyncDisplayState;
    detail: string;
  }>();
  const [review, setReview] = useState<PrepareSyncReviewResult>();
  const [choices, setChoices] = useState<Record<string, Resolution>>({});
  const setConfiguration = useCallback((configuration: SyncInspection) => {
    setTarget(configuration.target);
    setAccessState(configuration.accessState);
    setRefreshError(undefined);
  }, []);
  const [generation, setGeneration] = useState(0);
  const epoch = useRef(0);
  const sessionEpoch = useRef(0);
  const busy = useRef(false);
  const inspectEpoch = useRef(0);
  const permissionTarget = useRef<SyncLocation | null>(null);
  useEffect(() => {
    const location = target && !repairing ? target : draft;
    permissionTarget.current = {
      bucket: location.bucket,
      region: location.region,
      prefix: location.prefix,
    };
  }, [target, repairing, draft]);
  const clearSecrets = useCallback(() => {
    setDraft({ ...emptyCredentials });
    setRepairing(false);
    setExistingConnection(undefined);
    setTrustMode(undefined);
    setTrustReview(undefined);
    setGeneration((n) => n + 1);
  }, []);
  const clearPrivateState = useCallback(() => {
    ++sessionEpoch.current;
    ++epoch.current;
    ++inspectEpoch.current;
    busy.current = false;
    setOperation(undefined);
    setError(undefined);
    setErrorKind(undefined);
    setRefreshError(undefined);
    setAccessState("unknown");
    clearSecrets();
    setTarget(undefined);
    setManagement(undefined);
    setReview(undefined);
    setChoices({});
    setFeedback(undefined);
  }, [clearSecrets]);
  const handleAuthorizationLoss = useCallback(
    async (cause: unknown, owner: number) => {
      const lost = await vaultAuthorizationWasLost(cause, () =>
        capabilities.inspectManagement(vaultId),
      );
      if (owner !== epoch.current) return true;
      if (!lost) return false;
      clearPrivateState();
      setError("Unlock this vault again before continuing.");
      onSessionLost?.();
      return true;
    },
    [capabilities, vaultId, onSessionLost, clearPrivateState],
  );
  useEffect(() => {
    const lifecycle = sessionEpoch;
    const operations = epoch;
    const inspections = inspectEpoch;
    ++lifecycle.current;
    ++epoch.current;
    busy.current = false;
    async function inspect(reason: "refresh" | "session" | "pagehide") {
      if (reason !== "refresh") {
        clearPrivateState();
        if (reason === "pagehide") return;
      }
      const inspection = ++inspectEpoch.current;
      const owner = epoch.current;
      try {
        const configuration = await inspectConfiguration(vaultId, capabilities);
        const nextManagement = await capabilities.inspectManagement(vaultId);
        if (owner === epoch.current && inspection === inspectEpoch.current) {
          setConfiguration(configuration);
          setManagement(nextManagement);
          if (configuration.accessState !== "allowed") {
            setTrustReview(undefined);
            setFeedback(undefined);
            setReview(undefined);
            setChoices({});
          }
        }
      } catch (cause) {
        if (owner !== epoch.current || inspection !== inspectEpoch.current)
          return;
        if (await handleAuthorizationLoss(cause, owner)) return;
        if (inspection === inspectEpoch.current)
          setRefreshError(syncError(cause, "refresh"));
      }
    }
    void inspect("refresh");
    const unsubscribe = capabilities.subscribe((reason, affectsLocation) => {
      if (
        (reason === "permissions" || reason === "permissions-removed") &&
        affectsLocation &&
        (!permissionTarget.current ||
          !affectsLocation(permissionTarget.current))
      )
        return;
      if (reason === "permissions-removed") {
        ++epoch.current;
        setAccessState("missing");
      }
      if (reason === "permissions" || reason === "permissions-removed") {
        setTrustReview(undefined);
        setFeedback(undefined);
        setReview(undefined);
        setChoices({});
      }
      void inspect(
        reason === "session" || reason === "pagehide" ? reason : "refresh",
      );
    });
    return () => {
      unsubscribe();
      ++lifecycle.current;
      ++operations.current;
      ++inspections.current;
      busy.current = false;
    };
  }, [
    vaultId,
    capabilities,
    clearPrivateState,
    handleAuthorizationLoss,
    setConfiguration,
  ]);

  async function run(kind: Operation, task: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    const current = epoch.current;
    const sessionOwner = sessionEpoch.current;
    ++inspectEpoch.current;
    setOperation(kind);
    setError(undefined);
    setErrorKind(undefined);
    setRefreshError(undefined);
    const location = target && !repairing ? target : draft;
    try {
      if (kind !== "refresh") {
        await capabilities.requestAccess({
          bucket: location.bucket,
          region: location.region,
          prefix: location.prefix,
        });
        if (current !== epoch.current) return;
        setAccessState("allowed");
      }
      await task();
      if (current === epoch.current) {
        try {
          const nextManagement = await capabilities.inspectManagement(vaultId);
          if (current === epoch.current) setManagement(nextManagement);
        } catch (cause) {
          if (current !== epoch.current) return;
          if (await handleAuthorizationLoss(cause, current)) return;
          setRefreshError(
            "The action completed, but sync status could not be refreshed. Reopen Sync to check its status.",
          );
        }
      }
    } catch (cause) {
      if (current !== epoch.current) return;
      if (await handleAuthorizationLoss(cause, current)) return;
      const occupied = kind === "configure" && isOccupiedSyncTargetError(cause);
      setError(syncError(cause, kind, occupied ? location : undefined));
      setErrorKind(occupied ? "target-occupied" : undefined);
      setFeedback(undefined);
      setReview(undefined);
      setChoices({});
      setTrustReview(undefined);
      if (kind === "connect") setExistingConnection(undefined);
      // Initial setup or reconnection may have committed before an upload error.
      if (kind !== "configure" && kind !== "connect") return;
      try {
        const configuration = await inspectConfiguration(vaultId, capabilities);
        const nextManagement = await capabilities.inspectManagement(vaultId);
        if (current === epoch.current) {
          setConfiguration(configuration);
          setManagement(nextManagement);
          if (configuration.target) clearSecrets();
        }
      } catch (refreshCause) {
        if (current !== epoch.current) return;
        if (await handleAuthorizationLoss(refreshCause, current)) return;
        if (current === epoch.current) {
          clearSecrets();
          setTarget(undefined);
          setManagement(undefined);
        }
      }
    } finally {
      // Revocation discards the operation's result, but setup may still have
      // committed. Read current configuration only while this session survives.
      if (
        (kind === "configure" || kind === "connect") &&
        current !== epoch.current &&
        sessionOwner === sessionEpoch.current
      ) {
        const owner = epoch.current;
        const savedTarget = await refreshConfiguration(owner);
        if (savedTarget && sessionOwner === sessionEpoch.current)
          clearSecrets();
      }
      if (sessionOwner === sessionEpoch.current) {
        ++inspectEpoch.current;
        busy.current = false;
        setOperation(undefined);
      }
    }
  }
  async function refreshConfiguration(current: number) {
    const sessionOwner = sessionEpoch.current;
    const inspection = ++inspectEpoch.current;
    try {
      const configuration = await inspectConfiguration(vaultId, capabilities);
      if (current === epoch.current && inspection === inspectEpoch.current) {
        setConfiguration(configuration);
      }
      // Display freshness must not cancel same-session post-save secret cleanup.
      return configuration.target;
    } catch (cause) {
      if (sessionOwner !== sessionEpoch.current) return;
      const authorizationLost = await vaultAuthorizationWasLost(cause, () =>
        capabilities.inspectManagement(vaultId),
      );
      if (sessionOwner !== sessionEpoch.current) return;
      if (authorizationLost) {
        clearPrivateState();
        setError("Unlock this vault again before continuing.");
        onSessionLost?.();
        return;
      }
      clearSecrets();
      if (current !== epoch.current || inspection !== inspectEpoch.current)
        return;
      setTarget(undefined);
      setManagement(undefined);
      setRefreshError(
        "Could not load the sync configuration. Choose Try again to reload it.",
      );
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
    management,
    trustMode,
    trustReview,
    draft,
    repairing,
    existingConnection,
    accessState,
    operation,
    error: error ?? refreshError,
    errorKind,
    feedback,
    review,
    choices,
    generation,
    change: (value: CredentialDraft) => {
      setDraft(value);
      setError(undefined);
      setErrorKind(undefined);
      setFeedback(undefined);
      setExistingConnection(undefined);
      setTrustReview(undefined);
      setChoices({});
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
      setErrorKind(undefined);
      setFeedback(undefined);
      setExistingConnection(undefined);
    },
    cancel: () => {
      if (busy.current) return;
      clearSecrets();
      setError(undefined);
      setErrorKind(undefined);
      setFeedback(undefined);
    },
    beginTrust: (kind: "enrollment" | "revocation") => {
      if (!target || busy.current) return;
      clearSecrets();
      setTrustMode(kind);
      setDraft({ ...emptyCredentials, ...target });
      setReview(undefined);
      setChoices({});
      setError(undefined);
      setErrorKind(undefined);
      setFeedback(undefined);
    },
    prepareTrust: () =>
      run("trust-review", async () => {
        if (!trustMode) return;
        const current = epoch.current;
        setTrustReview(undefined);
        setChoices({});
        const result: TrustReview =
          trustMode === "enrollment"
            ? {
                kind: "enrollment",
                result: await capabilities.prepareEnrollment(vaultId),
              }
            : {
                kind: "revocation",
                result: await capabilities.prepareRevocation(vaultId, {
                  ...draft,
                }),
              };
        if (current === epoch.current) setTrustReview(result);
      }),
    acceptTrust: () =>
      run("trust-apply", async () => {
        if (!trustReview) return;
        const current = epoch.current;
        const params = {
          vaultId,
          reviewedSnapshotIdentities:
            trustReview.result.reviewedSnapshotIdentities,
          resolution: resolutionFromReview(trustReview.result.review, choices),
        };
        const result =
          trustReview.kind === "enrollment"
            ? await capabilities.acceptEnrollment(params)
            : await capabilities.acceptRevocation(params, { ...draft });
        if (current !== epoch.current) return;
        clearSecrets();
        setChoices({});
        uploaded(result);
      }),
    disable: () =>
      run("disable", async () => {
        const current = epoch.current;
        await capabilities.disable(vaultId);
        if (current !== epoch.current) return;
        clearSecrets();
        setReview(undefined);
        setChoices({});
        setTarget(null);
        setFeedback({
          state: "unconfigured",
          detail:
            "Sync is disabled. This device keeps its local vault. The current remote snapshot was removed.",
        });
      }),
    completeCredentialRevocation: () =>
      run("credential-revocation", async () => {
        const current = epoch.current;
        const result = await capabilities.completeCredentialRevocation(vaultId);
        if (current !== epoch.current) return;
        if (result.providerCredentialRevocation === "pending_external_deletion")
          setFeedback({
            state: "review-required",
            detail:
              "Previous access keys still need to be revoked. Finish verification on the device that replaced them.",
          });
        else if (result.syncUpload === "pending") uploaded(result);
        else
          setFeedback({
            state: "complete",
            detail:
              "Previous access keys can no longer access the vault. The updated vault is uploaded.",
          });
      }),
    allowAccess: () => run("permission", async () => {}),
    refresh: () =>
      run("refresh", async () => {
        await refreshConfiguration(epoch.current);
      }),
    test: () =>
      run("test", async () => {
        const current = epoch.current;
        await capabilities.test(vaultId, { ...draft });
        if (current === epoch.current)
          setFeedback({
            state: "access-confirmed",
            detail:
              "Your keys can read this storage location. Upload permission will be checked when you enable sync.",
          });
      }),
    save: () =>
      run(repairing ? "repair" : "configure", async () => {
        const current = epoch.current;
        const input = { ...draft };
        const outcome = repairing
          ? await capabilities.repair(vaultId, input)
          : await capabilities.configure(vaultId, input);
        if (current !== epoch.current) return;
        if (outcome && "kind" in outcome && outcome.kind === "existing") {
          setExistingConnection(outcome.connection);
          setFeedback({
            state: "existing-vault",
            detail:
              "S3 contains a newer signed copy of this vault. Use it to reconnect this device. The older local copy will be replaced; S3 will not be overwritten.",
          });
          return;
        }
        clearSecrets();
        if (outcome && "kind" in outcome) uploaded(outcome.result);
        else
          setFeedback({
            state: "not-checked",
            detail:
              "Access keys updated on this device. Check sync or retry an outstanding upload.",
          });
        await refreshConfiguration(current);
      }),
    connectExisting: () =>
      run("connect", async () => {
        if (!existingConnection) return;
        const current = epoch.current;
        const input = { ...draft };
        const result = await capabilities.connectExisting(
          vaultId,
          input,
          existingConnection,
        );
        if (current !== epoch.current) return;
        clearSecrets();
        uploaded(result);
        await refreshConfiguration(current);
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
