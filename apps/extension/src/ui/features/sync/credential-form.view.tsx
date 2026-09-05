import type { FormPresentation } from "@/ui/components/forms/form-state.type";
import { FormFrame, FormPassword } from "@/ui/components/forms/form-frame.view";
import { TextField } from "@/ui/components/forms/fields.view";
import { SafetyHelp } from "@/ui/components/layout/sections.view";
import { Button } from "@/ui/components/primitives/button";
export type CredentialDraft = {
  bucket: string;
  region: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
};
export function CredentialForm({
  value,
  onChange,
  errors,
  onTest,
  testing = false,
  ...form
}: FormPresentation<CredentialDraft> & {
  onTest: () => void;
  testing?: boolean;
}) {
  return (
    <FormFrame
      {...form}
      state={testing ? "pending" : form.state}
      label="Save sync configuration"
    >
      <SafetyHelp
        title="Your S3 storage"
        essential="Use credentials limited to this vault's storage location. Testing access does not configure sync or upload a vault."
      />
      {(["bucket", "region", "prefix", "accessKeyId"] as const).map((key) => (
        <TextField
          key={key}
          label={
            {
              bucket: "Bucket",
              region: "Region",
              prefix: "Object prefix",
              accessKeyId: "Access key ID",
            }[key]
          }
          value={value[key]}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          error={errors?.[key]}
          autoComplete="off"
          spellCheck={false}
        />
      ))}
      <FormPassword
        label="Secret access key"
        autoComplete="off"
        value={value.secretAccessKey}
        onChange={(secretAccessKey) => onChange({ ...value, secretAccessKey })}
        error={errors?.secretAccessKey}
      />
      <Button type="button" variant="outline" onClick={onTest}>
        {testing ? "Testing…" : "Test access"}
      </Button>
    </FormFrame>
  );
}
