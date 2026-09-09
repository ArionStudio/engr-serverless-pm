import { useMemo, useState } from "react";
import { VaultSettingsView } from "@/ui/features/settings/vault-settings.view";
import { SetupRecoveryView } from "@/ui/features/vault-setup/setup-recovery.view";
import { Button } from "@/ui/components/primitives/button";
import { entryToolsFixture } from "./entry-tools-fixture";
import { setupRecovery, setupVault } from "./setup-fixture";
import { gallerySetup } from "./setup-fixture";
import {
  galleryVaultSettings,
  type SettingsScenario,
} from "./settings-fixture";

export function SettingsExample({
  state = "ready",
}: {
  state?: SettingsScenario;
}) {
  const [vault, setVault] = useState({ ...setupVault, complete: true });
  const [replacement, setReplacement] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string>();
  const [removed, setRemoved] = useState(false);
  const [authorizationLost, setAuthorizationLost] = useState(false);
  const capabilities = useMemo(
    () =>
      galleryVaultSettings(state, (deviceName, duration) => {
        setVault((current) => ({ ...current, deviceName, duration }));
      }),
    [state],
  );
  if (removed)
    return (
      <section className="space-y-4">
        <p role="status">Local vault removed.</p>
        <Button variant="outline" onClick={() => setRemoved(false)}>
          Reset example
        </Button>
      </section>
    );
  if (replacement)
    return (
      <SetupRecoveryView
        recovery={{ ...setupRecovery, vault, purpose: "recovery-replacement" }}
        verifying={verifying}
        pending={false}
        error={error}
        onSave={async () => {}}
        onContinue={() => {
          setVerifying(true);
          setError(undefined);
        }}
        onReview={() => {
          setVerifying(false);
          setError(undefined);
        }}
        onLock={() => {
          setReplacement(false);
          setVerifying(false);
          setError(undefined);
        }}
        onVerify={(answers) => {
          if (
            !setupRecovery.positions.every(
              (position) =>
                answers[position]?.trim() === setupRecovery.words[position - 1],
            )
          ) {
            setError(
              "The words do not match. Check the numbered positions in your saved copy.",
            );
            return;
          }
          setReplacement(false);
          setVerifying(false);
          setError(undefined);
        }}
      />
    );
  return (
    <>
      <VaultSettingsView
        key={state}
        vault={vault}
        capabilities={capabilities}
        assessPassword={entryToolsFixture.assess}
        generatePassword={gallerySetup().generatePassword}
        onReplaceRecovery={() => setReplacement(true)}
        onDeleted={() => setRemoved(true)}
        onSaved={() => {}}
        onSessionLost={() => setAuthorizationLost(true)}
      />
      {authorizationLost ? (
        <p role="status">Authorization lost; root refresh requested.</p>
      ) : null}
    </>
  );
}
