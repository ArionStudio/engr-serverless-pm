import { useEffect, useRef, useState } from "react";
import { ThemeToggle, useTheme } from "@/ui/features/theme";
import {
  DeviceSettingsForm,
  type DeviceSettingsDraft,
} from "@/ui/features/devices/device-settings-form.view";
import type { VaultSettingsCapabilities } from "@/ui/features/settings/settings.type";
import type { SetupVault } from "@/ui/features/vault-setup/setup.type";
import { vaultLockOptions } from "@/ui/lib/vault-lock-options";
import { Button } from "@/ui/components/primitives/button";
import { vaultAuthorizationWasLost } from "@/ui/lib/vault-authorization";

export function PopupSettings({
  vault,
  capabilities,
  onSaved,
  onBusyChange,
  onOpenOptions,
  onSessionLost,
}: {
  vault: SetupVault;
  capabilities?: Pick<
    VaultSettingsCapabilities,
    "saveDevice" | "inspectAuthorization"
  >;
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
  onOpenOptions: () => void;
  onSessionLost?: () => void;
}) {
  const { preference, setTheme } = useTheme();
  const [saved, setSaved] = useState<DeviceSettingsDraft>({
    name: vault.deviceName,
    lockDuration: vault.duration,
  });
  const [draft, setDraft] = useState(saved);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const active = useRef(false);
  const epoch = useRef(0);
  const busy = useRef(false);
  const dirty =
    draft.name !== saved.name || draft.lockDuration !== saved.lockDuration;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      epoch.current += 1;
    };
  }, []);
  useEffect(() => {
    onBusyChange(pending || dirty);
  }, [pending, dirty, onBusyChange]);
  async function save() {
    if (!capabilities || busy.current) return;
    if (!draft.name.trim() || draft.name.trim().length > 80) {
      setError("Enter a device name up to 80 characters.");
      return;
    }
    busy.current = true;
    const request = epoch.current;
    setPending(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await capabilities.saveDevice(
        vault.vaultId,
        draft.name,
        draft.lockDuration,
      );
      if (!active.current || request !== epoch.current) return;
      const next = { ...draft, name: draft.name.trim() };
      setSaved(next);
      setDraft(next);
      setMessage("Saved. The lock duration applies from the next unlock.");
      onSaved();
    } catch (cause) {
      if (!active.current || request !== epoch.current) return;
      const lost = await vaultAuthorizationWasLost(cause, () =>
        capabilities.inspectAuthorization(vault.vaultId),
      );
      if (!active.current || request !== epoch.current) return;
      if (lost) {
        epoch.current += 1;
        busy.current = false;
        setPending(false);
        setSaved({ name: vault.deviceName, lockDuration: vault.duration });
        setDraft({ name: vault.deviceName, lockDuration: vault.duration });
        setError(undefined);
        setMessage(undefined);
        onSessionLost?.();
        return;
      }
      setError("Could not save device settings. Try again.");
    } finally {
      if (active.current && request === epoch.current) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-label="Appearance">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <ThemeToggle preference={preference} onThemeChange={setTheme} />
      </section>
      {capabilities ? (
        <section
          className="space-y-4 border-t border-border pt-5"
          aria-label="This browser settings"
        >
          <h2 className="text-sm font-semibold">This browser</h2>
          <DeviceSettingsForm
            value={draft}
            onChange={(next) => {
              setDraft(next);
              setError(undefined);
              setMessage(undefined);
            }}
            lockOptions={vaultLockOptions}
            state={
              pending
                ? "pending"
                : error
                  ? "error"
                  : message
                    ? "success"
                    : "idle"
            }
            message={error ?? message}
            onSubmit={() => void save()}
            onCancel={() => {
              setDraft(saved);
              setError(undefined);
              setMessage(undefined);
            }}
          />
        </section>
      ) : null}
      <div className="border-t border-border pt-4">
        <Button
          variant="outline"
          disabled={pending || dirty}
          onClick={onOpenOptions}
        >
          Open full vault settings
        </Button>
      </div>
    </div>
  );
}
