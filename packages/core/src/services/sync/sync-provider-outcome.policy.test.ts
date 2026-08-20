import { describe, expect, it } from "vitest";
import {
  InvalidSyncProviderOutcomeError,
  RemoteVaultSnapshotChangedError,
  SyncProviderUploadRejectedError,
} from "../../errors/sync.errors";
import {
  requireSyncProviderUploadOutcome,
  resolveNonStartedSyncProviderUploadOutcome,
  resolveSyncProviderUploadOutcome,
  resolveSyncProviderUploadStatus,
} from "./sync-provider-outcome.policy";

describe("sync provider upload outcome policy", () => {
  it.each([
    { status: "committed" },
    {
      status: "definitely_not_committed",
      reason: "remote_snapshot_changed",
    },
    {
      status: "definitely_not_committed",
      reason: "provider_rejected",
    },
    { status: "outcome_unknown" },
  ] as const)("accepts the exact $status result", (outcome) => {
    expect(requireSyncProviderUploadOutcome(outcome)).toEqual(outcome);
  });

  it.each([
    undefined,
    null,
    "committed",
    [],
    new Date(),
    {},
    { status: "committed", reason: "remote_snapshot_changed" },
    { status: "definitely_not_committed" },
    { status: "definitely_not_committed", reason: "network_error" },
    { status: "outcome_unknown", extra: true },
  ])("rejects malformed or non-exact result %#", (outcome) => {
    expect(() => requireSyncProviderUploadOutcome(outcome)).toThrow(
      InvalidSyncProviderOutcomeError,
    );
  });

  it("rejects accessor and symbol properties", () => {
    const accessorOutcome = Object.defineProperty({}, "status", {
      enumerable: true,
      get: () => "committed",
    });
    const symbolOutcome = {
      status: "committed",
      [Symbol("extra")]: true,
    };

    expect(() => requireSyncProviderUploadOutcome(accessorOutcome)).toThrow(
      InvalidSyncProviderOutcomeError,
    );
    expect(() => requireSyncProviderUploadOutcome(symbolOutcome)).toThrow(
      InvalidSyncProviderOutcomeError,
    );
  });

  it("treats a malformed post-write result as outcome unknown", () => {
    expect(resolveSyncProviderUploadOutcome(undefined)).toEqual({
      status: "outcome_unknown",
    });
  });

  it("treats a hostile record that throws during inspection as outcome unknown", () => {
    const hostileOutcome = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("inspection failed");
        },
      },
    );

    expect(resolveSyncProviderUploadOutcome(hostileOutcome)).toEqual({
      status: "outcome_unknown",
    });
  });

  it.each([{ status: "committed" }, { status: "outcome_unknown" }, undefined])(
    "does not accept %# as a proven non-started outcome",
    (outcome) => {
      expect(resolveNonStartedSyncProviderUploadOutcome(outcome)).toEqual({
        status: "outcome_unknown",
      });
    },
  );

  it("preserves a definite non-commit before start", () => {
    const outcome = {
      status: "definitely_not_committed",
      reason: "remote_snapshot_changed",
    } as const;

    expect(resolveNonStartedSyncProviderUploadOutcome(outcome)).toEqual(
      outcome,
    );
  });

  it.each([
    [{ status: "committed" }, "complete"],
    [{ status: "outcome_unknown" }, "pending"],
    [undefined, "pending"],
  ] as const)("maps upload outcome %# to status %s", (outcome, status) => {
    expect(resolveSyncProviderUploadStatus("vault-id", outcome)).toBe(status);
  });

  it("preserves distinct definite non-commit errors", () => {
    expect(() =>
      resolveSyncProviderUploadStatus("vault-id", {
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      }),
    ).toThrow(RemoteVaultSnapshotChangedError);
    expect(() =>
      resolveSyncProviderUploadStatus("vault-id", {
        status: "definitely_not_committed",
        reason: "provider_rejected",
      }),
    ).toThrow(SyncProviderUploadRejectedError);
  });
});
