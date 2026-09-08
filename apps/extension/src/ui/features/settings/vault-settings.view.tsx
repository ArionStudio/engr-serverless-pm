import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/ui/components/primitives/button";
import { GuidancePanel } from "@/ui/components/feedback/guidance-panel.view";
import { DestructiveConfirmation } from "@/ui/components/feedback/destructive-confirmation.view";
import { ActionFeedback } from "@/ui/components/feedback/action-feedback.view";
import {
  PasswordChangeForm,
  type PasswordChangeDraft,
} from "../vault-access/access-forms.view";
import {
  DeviceSettingsForm,
  type DeviceSettingsDraft,
} from "../devices/device-settings-form.view";
import { usePasswordAssessment } from "../vault-setup/use-password-assessment";
import type { AssessPassword, SetupVault } from "../vault-setup/setup.type";
import { vaultLockOptions } from "@/ui/lib/vault-lock-options";
import type { VaultSettingsCapabilities } from "./settings.type";
import { vaultAuthorizationWasLost } from "@/ui/lib/vault-authorization";

const emptyPassword: PasswordChangeDraft = {
  currentPassword: "",
  password: "",
  confirmation: "",
};

export function VaultSettingsView({
  vault,
  capabilities,
  assessPassword,
  onReplaceRecovery,
  onDeleted,
  onSaved,
  onSessionLost,
}: {
  vault: SetupVault;
  capabilities: VaultSettingsCapabilities;
  assessPassword: AssessPassword;
  onReplaceRecovery: () => void;
  onDeleted: () => void;
  onSaved: () => void;
  onSessionLost?: () => void;
}) {
  const [editing, setEditing] = useState<"device" | "password">();
  const [password, setPassword] = useState(emptyPassword);
  const [device, setDevice] = useState<DeviceSettingsDraft>({
    name: vault.deviceName,
    lockDuration: vault.duration,
  });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [confirmation, setConfirmation] = useState<"recovery" | "remove">();
  const [acknowledged, setAcknowledged] = useState(false);
  const busy = useRef(false);
  const epoch = useRef(0);
  const { score, strengthState, invalidate, retry } = usePasswordAssessment(
    password.password,
    assessPassword,
  );
  const clearForAuthorizationLoss = useCallback(() => {
    epoch.current += 1;
    busy.current = false;
    setPending(false);
    setEditing(undefined);
    setPassword(emptyPassword);
    setDevice({ name: vault.deviceName, lockDuration: vault.duration });
    setSubmitted(false);
    setMessage(undefined);
    setError(undefined);
    setConfirmation(undefined);
    setAcknowledged(false);
    onSessionLost?.();
  }, [onSessionLost, vault.deviceName, vault.duration]);
  useEffect(
    () => () => {
      epoch.current += 1;
    },
    [],
  );
  const errors = {
    currentPassword: password.currentPassword
      ? undefined
      : "Enter your current password.",
    password: !password.password
      ? "Enter a new password."
      : strengthState === "ready" && score !== 4
        ? "Use a longer, less predictable password until its strength is Strong."
        : undefined,
    confirmation:
      password.confirmation !== password.password || !password.confirmation
        ? "Confirm your new password. The passwords must match."
        : undefined,
  };
  function reset() {
    setEditing(undefined);
    setPassword(emptyPassword);
    setSubmitted(false);
    setError(undefined);
  }
  async function run(
    action: () => Promise<void>,
    success: string,
    failure: string,
    after?: () => void,
  ) {
    if (busy.current) return;
    busy.current = true;
    const request = epoch.current;
    setPending(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await action();
      if (request !== epoch.current) return;
      reset();
      setConfirmation(undefined);
      setMessage(success);
      after?.();
    } catch (cause) {
      if (request !== epoch.current) return;
      const lost = await vaultAuthorizationWasLost(cause, () =>
        capabilities.inspectAuthorization(vault.vaultId),
      );
      if (request !== epoch.current) return;
      if (lost) {
        clearForAuthorizationLoss();
        return;
      }
      setError(failure);
    } finally {
      if (request === epoch.current) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  function confirm(value: "recovery" | "remove") {
    setError(undefined);
    setAcknowledged(false);
    setConfirmation(value);
  }
  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Vault settings</h1>
      {!editing && !confirmation ? (
        <ActionFeedback
          state={error ? "error" : message ? "success" : "idle"}
          message={error ?? message}
        />
      ) : null}
      <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">This browser</h2>
          {editing !== "device" ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                reset();
                setDevice({
                  name: vault.deviceName,
                  lockDuration: vault.duration,
                });
                setEditing("device");
              }}
            >
              Edit device settings
            </Button>
          ) : null}
        </div>
        {editing === "device" ? (
          <DeviceSettingsForm
            value={device}
            onChange={setDevice}
            lockOptions={vaultLockOptions}
            errors={
              submitted &&
              (!device.name.trim() || device.name.trim().length > 80)
                ? { name: "Enter a device name up to 80 characters." }
                : undefined
            }
            state={pending ? "pending" : error ? "error" : "idle"}
            message={error}
            onCancel={reset}
            onSubmit={() => {
              setSubmitted(true);
              if (!device.name.trim() || device.name.trim().length > 80) return;
              void run(
                () =>
                  capabilities.saveDevice(
                    vault.vaultId,
                    device.name,
                    device.lockDuration,
                  ),
                "Device settings saved. The lock duration applies from the next unlock.",
                "Could not save device settings. Unlock the vault and try again.",
                onSaved,
              );
            }}
          />
        ) : (
          <dl className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">Device name</dt>
              <dd className="font-medium break-words">{vault.deviceName}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">
                Lock after unlocking
              </dt>
              <dd className="font-medium">
                {
                  vaultLockOptions.find(
                    (option) => option.value === vault.duration,
                  )?.label
                }
              </dd>
            </div>
          </dl>
        )}
      </section>
      <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Vault password</h2>
          {editing !== "password" ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                reset();
                setEditing("password");
              }}
            >
              Change password
            </Button>
          ) : null}
        </div>
        {editing === "password" ? (
          <PasswordChangeForm
            value={password}
            onChange={(next) => {
              if (password.password !== next.password) invalidate();
              setPassword(next);
            }}
            errors={submitted ? errors : undefined}
            score={score}
            strengthState={strengthState}
            onRetryStrength={retry}
            state={pending ? "pending" : error ? "error" : "idle"}
            message={error}
            onCancel={reset}
            onSubmit={() => {
              setSubmitted(true);
              if (
                Object.values(errors).some(Boolean) ||
                strengthState !== "ready" ||
                score !== 4
              )
                return;
              void run(
                () =>
                  capabilities.changePassword(
                    vault.vaultId,
                    password.currentPassword,
                    password.password,
                  ),
                "Password changed for this browser.",
                "Could not change the password. Check your current password and that the vault is unlocked.",
              );
            }}
          />
        ) : (
          <p className="max-w-prose text-base leading-7 text-muted-foreground">
            Your password protects access on this browser. Other enrolled
            devices keep their own passwords.
          </p>
        )}
      </section>
      <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Recovery words</h2>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => confirm("recovery")}
          >
            Replace recovery words
          </Button>
        </div>
        <p className="max-w-prose text-base leading-7 text-muted-foreground">
          Recovery needs your saved words and the matching data in this browser.
          Keep a private copy of your words outside this vault.
        </p>
      </section>
      <section className="space-y-5 rounded-xl border border-destructive/40 bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">
          Remove vault from this browser
        </h2>
        <GuidancePanel
          variant="warning"
          title="Local vault data will be removed"
        >
          <p>
            This removes entries, access keys and recovery data stored by this
            browser. Recovery words alone cannot restore them. Synced storage
            and other enrolled devices are not deleted.
          </p>
        </GuidancePanel>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => confirm("remove")}
        >
          Remove local vault
        </Button>
      </section>
      <DestructiveConfirmation
        open={confirmation !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(undefined);
            setError(undefined);
          }
        }}
        action={
          confirmation === "remove"
            ? "Remove local vault"
            : "Replace recovery words"
        }
        identity={vault.name}
        consequences={
          confirmation === "remove"
            ? "This permanently removes this browser's vault and recovery data. Check that another enrolled device has your latest entries before removing it. S3 data and device trust are unchanged."
            : "You must save and verify 24 new words. Your previous words will no longer match this browser's current recovery data. Older saved recovery-data copies can still work with their original words."
        }
        acknowledgment={
          confirmation === "remove"
            ? "I understand that recovery words alone cannot restore deleted browser data."
            : "I can save a private copy of the replacement words now."
        }
        acknowledged={acknowledged}
        onAcknowledge={setAcknowledged}
        pending={pending}
        error={error}
        onConfirm={() => {
          if (!acknowledged || pending) return;
          if (confirmation === "recovery") {
            reset();
            setConfirmation(undefined);
            onReplaceRecovery();
          } else if (confirmation === "remove")
            void run(
              () => capabilities.removeLocalVault(vault.vaultId),
              "Local vault removed.",
              "Could not remove the local vault. Reload to check its state before trying again.",
              onDeleted,
            );
        }}
      />
    </section>
  );
}
