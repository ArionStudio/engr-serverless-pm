import { EntryEditorExample } from "./entry-widgets.example";
import { vaultLockOptions } from "@/ui/lib/vault-lock-options";
import type { CatalogId } from "./usage";
import { useState, type ReactNode } from "react";
import type {
  FormPresentation,
  OperationState,
} from "@/ui/components/forms/form-state.type";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
import {
  UnlockForm,
  PasswordChangeForm,
  VaultPicker,
  type UnlockDraft,
  type PasswordChangeDraft,
} from "@/ui/features/vault-access";
import { EntryForm, type EntryDraft } from "@/ui/features/entries";
import {
  PasswordCreationForm,
  type PasswordCreationDraft,
} from "@/ui/features/vault-setup";
import { CredentialForm, type CredentialDraft } from "@/ui/features/sync";
import {
  LocalRecoveryForm,
  type LocalRecoveryDraft,
} from "@/ui/features/recovery";
import {
  DeviceSettingsForm,
  type DeviceSettingsDraft,
} from "@/ui/features/devices";
import { Scenario } from "./specimen.view";
import { Specimen } from "./specimen.view";
import { demoVaults, demoTags } from "./fixtures";
function FormExample<T>({
  id,
  name,
  owner,
  initial,
  errors,
  children,
}: {
  id: CatalogId;
  name: string;
  owner: string;
  initial: T;
  errors: Partial<Record<keyof T, string>>;
  children: (props: FormPresentation<T>) => ReactNode;
}) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<OperationState>("idle");
  const [generation, setGeneration] = useState(0);
  const [message, setMessage] = useState("");
  function clear(next: OperationState) {
    setValue(initial);
    setState(next);
    setGeneration((n) => n + 1);
    setMessage(next === "success" ? "Draft cleared." : "Draft reset.");
  }
  return (
    <Specimen id={id} name={name} owner={owner}>
      <div className="space-y-5">
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Response
          <NativeSelect
            aria-label={`${name} response`}
            value={state}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "success") clear(next);
              else if (
                next === "idle" ||
                next === "pending" ||
                next === "error"
              ) {
                setState(next);
                setMessage(
                  next === "error"
                    ? "Correct the field and try again."
                    : next === "pending"
                      ? "Waiting for a response."
                      : "",
                );
              }
            }}
          >
            {["idle", "pending", "error", "success"].map((s) => (
              <NativeSelectOption key={s} value={s}>
                {s}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <div key={generation}>
          {children({
            value,
            onChange: setValue,
            state,
            errors: state === "error" ? errors : undefined,
            message,
            onSubmit: () => clear("success"),
            onCancel: () => clear("idle"),
          })}
        </div>
      </div>
    </Specimen>
  );
}
export function FormExamples() {
  const [strengthState, setStrengthState] = useState<
    "ready" | "pending" | "unavailable"
  >("ready");
  const [vault, setVault] = useState<string | null>("personal");
  const [localData, setLocalData] = useState(true);
  const [recoveryStrength, setRecoveryStrength] = useState<
    "ready" | "pending" | "unavailable"
  >("ready");
  const [mode, setMode] = useState("add");
  const [testMessage, setTestMessage] = useState("");
  return (
    <div className="review-grid grid gap-x-8 gap-y-10">
      <FormExample<UnlockDraft>
        id="F01"
        name="UnlockForm"
        owner="Feature form · vault-access"
        initial={{ vaultId: "personal", password: "", lockDuration: 600_000 }}
        errors={{ password: "The password did not unlock this vault." }}
      >
        {(props) => (
          <UnlockForm
            {...props}
            vaults={demoVaults}
            lockOptions={vaultLockOptions}
          />
        )}
      </FormExample>
      <FormExample<EntryDraft>
        id="F02"
        name="EntryForm"
        owner="Feature form · entries"
        initial={{
          login: "",
          url: "",
          password: "",
          tagIds: [],
          folderId: "uncategorized",
          allowWeakPassword: false,
        }}
        errors={{
          password: "Password is weak. Review it before saving.",
        }}
      >
        {(props) => (
          <>
            <label className="mb-5 flex items-center gap-2 text-xs">
              Mode
              <NativeSelect
                aria-label="Entry form mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <NativeSelectOption value="add">Add</NativeSelectOption>
                <NativeSelectOption value="edit">Edit</NativeSelectOption>
              </NativeSelect>
            </label>
            <EntryForm
              {...props}
              tags={demoTags}
              mode={mode === "edit" ? "edit" : "add"}
              weakPassword={props.state === "error"}
            />
            <EntryEditorExample />
          </>
        )}
      </FormExample>
      <FormExample<PasswordCreationDraft>
        id="F03"
        name="PasswordCreationForm"
        owner="Feature form · vault-setup"
        initial={{ password: "", confirmation: "" }}
        errors={{ confirmation: "The confirmation does not match." }}
      >
        {(props) => (
          <>
            <label className="mb-5 flex items-center gap-2 text-xs">
              Strength assessment
              <NativeSelect
                aria-label="Password creation strength state"
                value={strengthState}
                onChange={(event) => {
                  const next = event.target.value;
                  if (
                    next === "ready" ||
                    next === "pending" ||
                    next === "unavailable"
                  ) {
                    if (next !== "ready" && !props.value.password) {
                      props.onChange({
                        ...props.value,
                        password: "DEMO-password-not-a-credential",
                      });
                    }
                    setStrengthState(next);
                  }
                }}
              >
                <NativeSelectOption value="ready">Ready</NativeSelectOption>
                <NativeSelectOption value="pending">Pending</NativeSelectOption>
                <NativeSelectOption value="unavailable">
                  Unavailable
                </NativeSelectOption>
              </NativeSelect>
            </label>
            <PasswordCreationForm
              {...props}
              generatePassword={async () => ({
                password: "Gallery-river-8!Pine-sky",
              })}
              score={props.value.password ? 4 : undefined}
              strengthState={strengthState}
              onRetryStrength={() => setStrengthState("ready")}
            />
          </>
        )}
      </FormExample>
      <FormExample<PasswordChangeDraft>
        id="F04"
        name="PasswordChangeForm"
        owner="Feature form · vault-access"
        initial={{ currentPassword: "", password: "", confirmation: "" }}
        errors={{
          currentPassword: "The current password was rejected.",
        }}
      >
        {(props) => (
          <PasswordChangeForm
            {...props}
            generatePassword={async () => ({
              password: "Gallery-river-8!Pine-sky",
            })}
          />
        )}
      </FormExample>
      <FormExample<CredentialDraft>
        id="F05"
        name="CredentialForm"
        owner="Feature form · sync"
        initial={{
          bucket: "personal-vault",
          region: "eu-central-1",
          prefix: "vault/",
          accessKeyId: "",
          secretAccessKey: "",
        }}
        errors={{
          secretAccessKey:
            "The provider denied access. Check the credential and permissions.",
        }}
      >
        {(props) => (
          <>
            <Scenario
              label="Credential form mode"
              options={["setup", "guided", "repair"] as const}
            >
              {(mode) => (
                <CredentialForm
                  {...props}
                  mode={mode === "repair" ? "repair" : "setup"}
                  onEditLocation={
                    mode === "guided"
                      ? () => setTestMessage("Storage step requested.")
                      : undefined
                  }
                  feedback={
                    testMessage ? <p role="status">{testMessage}</p> : undefined
                  }
                  onTest={() => setTestMessage("Access test requested.")}
                />
              )}
            </Scenario>
          </>
        )}
      </FormExample>
      <FormExample<LocalRecoveryDraft>
        id="F06"
        name="LocalRecoveryForm"
        owner="Feature form · recovery; vault selector composed here"
        initial={{ phrase: "", password: "", confirmation: "" }}
        errors={{
          phrase: "The phrase could not recover this local vault.",
        }}
      >
        {(props) => (
          <>
            <label className="mb-5 flex items-center gap-2 text-xs">
              Local data
              <NativeSelect
                aria-label="Recovery local data"
                value={localData ? "available" : "missing"}
                onChange={(e) => setLocalData(e.target.value === "available")}
              >
                <NativeSelectOption value="available">
                  Available
                </NativeSelectOption>
                <NativeSelectOption value="missing">Missing</NativeSelectOption>
              </NativeSelect>
            </label>
            <label className="mb-5 flex items-center gap-2 text-xs">
              Password assessment
              <NativeSelect
                aria-label="Recovery password assessment"
                value={recoveryStrength}
                onChange={(event) => {
                  const next = event.target.value;
                  if (
                    next === "ready" ||
                    next === "pending" ||
                    next === "unavailable"
                  )
                    setRecoveryStrength(next);
                }}
              >
                <NativeSelectOption value="ready">Ready</NativeSelectOption>
                <NativeSelectOption value="pending">
                  Checking
                </NativeSelectOption>
                <NativeSelectOption value="unavailable">
                  Unavailable
                </NativeSelectOption>
              </NativeSelect>
            </label>
            <LocalRecoveryForm
              {...props}
              generatePassword={async () => ({
                password: "Gallery-river-8!Pine-sky",
              })}
              score={4}
              strengthState={recoveryStrength}
              onRetryStrength={() => setRecoveryStrength("ready")}
              localDataAvailable={localData}
              vaultSelector={
                <VaultPicker
                  vaults={localData ? demoVaults : []}
                  value={vault}
                  onChange={setVault}
                />
              }
            />
          </>
        )}
      </FormExample>
      <FormExample<DeviceSettingsDraft>
        id="F07"
        name="DeviceSettingsForm"
        owner="Feature form · devices"
        initial={{ name: "This laptop", lockDuration: 600_000 }}
        errors={{
          name: "The name could not be saved. Your input is retained.",
        }}
      >
        {(props) => (
          <DeviceSettingsForm {...props} lockOptions={vaultLockOptions} />
        )}
      </FormExample>
    </div>
  );
}
