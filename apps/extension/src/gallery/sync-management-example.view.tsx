import { useState } from "react";
import { SyncTrustReview } from "@/ui/features/sync/sync-trust-review.view";
import {
  SyncStatus,
  type Resolution,
} from "@/ui/features/sync/sync-review.view";
import type { TrustReview } from "@/ui/features/sync/sync.type";
import { syncLocation, syncReview } from "./sync-fixture";

export type SyncTrustScenario =
  | "trust-enrollment"
  | "trust-revocation"
  | "trust-review-enrollment"
  | "trust-review-revocation"
  | "trust-applying"
  | "trust-error";

export function SyncTrustExample({
  scenario,
}: {
  scenario: SyncTrustScenario;
}) {
  const kind = scenario.includes("revocation") ? "revocation" : "enrollment";
  const [value, setValue] = useState({
    ...syncLocation,
    accessKeyId: "",
    secretAccessKey: "",
  });
  const [loaded, setLoaded] = useState(
    scenario.includes("review") || scenario === "trust-applying",
  );
  const [accepted, setAccepted] = useState(false);
  const [choices, setChoices] = useState<Record<string, Resolution>>({});
  const base = {
    reviewedSnapshotIdentities: syncReview.reviewedSnapshotIdentities,
    enrolledDeviceIds: ["laptop-device"],
    vaultKeyGeneration: 2,
    review: syncReview.review!.actionable,
  };
  const review: TrustReview =
    kind === "enrollment"
      ? { kind, result: base }
      : {
          kind,
          result: {
            ...base,
            enrolledDeviceIds: [],
            revokedDeviceIds: ["old-phone-device"],
          },
        };
  if (accepted)
    return (
      <SyncStatus
        state="complete"
        detail="The device changes were accepted and uploaded."
        onAction={() => setAccepted(false)}
        action="Review device changes"
      />
    );
  return (
    <SyncTrustReview
      kind={kind}
      review={loaded ? review : undefined}
      value={value}
      choices={choices}
      onChange={setValue}
      onChoose={(id, choice) =>
        setChoices((current) => ({ ...current, [id]: choice }))
      }
      onPrepare={() => setLoaded(true)}
      onApply={() => {
        setValue({ ...syncLocation, accessKeyId: "", secretAccessKey: "" });
        setAccepted(true);
      }}
      onCancel={() => {
        setLoaded(false);
        setChoices({});
        setValue({ ...syncLocation, accessKeyId: "", secretAccessKey: "" });
      }}
      busy={scenario === "trust-applying"}
      applying={scenario === "trust-applying"}
      error={
        scenario === "trust-error"
          ? "The vault changed. Load the device changes again before applying them."
          : undefined
      }
    />
  );
}
