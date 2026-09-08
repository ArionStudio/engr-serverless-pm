import { useState, type ReactNode } from "react";
import type { FormPresentation } from "@/ui/components/forms/form-state.type";
import { FormFrame, FormPassword } from "@/ui/components/forms/form-frame.view";
import { TextField } from "@/ui/components/forms/fields.view";
import { Button } from "@/ui/components/primitives/button";
import { Spinner } from "@/ui/components/primitives/spinner";
import "./s3-setup-guide.css";

export type CredentialDraft = {
  bucket: string;
  region: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
};
const labels = {
  bucket: "Bucket",
  region: "Region",
  prefix: "Object prefix",
  accessKeyId: "Access key ID",
  secretAccessKey: "Secret access key",
};
export function CredentialForm({
  value,
  onChange,
  errors,
  onTest,
  testing = false,
  mode = "setup",
  onEditLocation,
  feedback,
  ...form
}: FormPresentation<CredentialDraft> & {
  onTest: () => void;
  testing?: boolean;
  mode?: "setup" | "repair" | "connect-existing";
  onEditLocation?: () => void;
  feedback?: ReactNode;
}) {
  const [attempted, setAttempted] = useState(false);
  const missing = (key: keyof CredentialDraft) =>
    key !== "prefix" && !value[key].trim();
  function error(key: keyof CredentialDraft) {
    return (
      errors?.[key] ??
      (attempted && missing(key) ? `${labels[key]} is required.` : undefined)
    );
  }
  function validate(action: () => void) {
    setAttempted(true);
    if ((Object.keys(labels) as (keyof CredentialDraft)[]).some(missing))
      return;
    action();
  }
  return (
    <div className="sync-credentials @container/connection min-w-0 max-w-3xl">
      <FormFrame
        {...form}
        noValidate
        onSubmit={() => validate(form.onSubmit)}
        state={testing ? "pending" : form.state}
        actions={
          <div className="flex items-center justify-between gap-4 border-t pt-6">
            <Button
              type="button"
              variant="ghost"
              disabled={testing || form.state === "pending"}
              onClick={form.onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={testing || form.state === "pending"}
            >
              {testing || form.state === "pending" ? <Spinner /> : null}
              {form.state === "pending" && !testing
                ? "Saving…"
                : mode === "repair"
                  ? "Save access keys"
                  : mode === "connect-existing"
                    ? "Use newer vault from S3"
                    : "Enable sync"}
            </Button>
          </div>
        }
      >
        <div className="min-w-0 space-y-7">
          <section
            aria-label="Storage location"
            className="min-w-0 space-y-4 rounded-lg border bg-muted/20 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-base font-semibold">Storage location</h4>
              {onEditLocation ? (
                <Button variant="ghost" type="button" onClick={onEditLocation}>
                  Edit storage
                </Button>
              ) : null}
            </div>
            {onEditLocation ? (
              <dl className="grid gap-4 @lg/connection:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                {(["bucket", "region", "prefix"] as const).map((key) => (
                  <div key={key}>
                    <dt className="text-sm text-muted-foreground">
                      {labels[key]}
                    </dt>
                    <dd className="mt-1 break-all text-base">
                      {value[key] ||
                        (key === "prefix" ? "Bucket root" : "Not set")}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              (["bucket", "region", "prefix"] as const).map((key) => (
                <TextField
                  key={key}
                  label={labels[key]}
                  readOnly={mode === "repair"}
                  required={key !== "prefix"}
                  value={value[key]}
                  onChange={(e) =>
                    onChange({ ...value, [key]: e.target.value })
                  }
                  error={error(key)}
                  autoComplete="off"
                  spellCheck={false}
                />
              ))
            )}
          </section>
          <section aria-label="Access keys" className="min-w-0 space-y-5">
            <h4 className="text-lg font-semibold">Access keys</h4>
            <TextField
              label="Access key ID"
              required
              value={value.accessKeyId}
              onChange={(e) =>
                onChange({ ...value, accessKeyId: e.target.value })
              }
              error={error("accessKeyId")}
              autoComplete="off"
              spellCheck={false}
            />
            <FormPassword
              label="Secret access key"
              autoComplete="off"
              value={value.secretAccessKey}
              onChange={(secretAccessKey) =>
                onChange({ ...value, secretAccessKey })
              }
              error={error("secretAccessKey")}
            />
            <p className="max-w-[65ch] text-base leading-7 text-muted-foreground">
              Use the dedicated sync user's keys. They are encrypted on this
              device and are not shared through the vault.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => validate(onTest)}
            >
              {testing ? "Testing…" : "Test access"}
            </Button>
            {feedback}
          </section>
        </div>
      </FormFrame>
    </div>
  );
}
