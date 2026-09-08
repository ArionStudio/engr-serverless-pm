import type { FormPresentation } from "@/ui/components/forms/form-state.type";
import { FormFrame, FormPassword } from "@/ui/components/forms/form-frame.view";
import type { ReactNode } from "react";
import { useId } from "react";
import { TextField } from "@/ui/components/forms/fields.view";
import { Checkbox } from "@/ui/components/primitives/checkbox";
import { FieldLabel } from "@/ui/components/primitives/field";
import { TagSelection, type TagOption } from "./entries.view";
export type EntryDraft = {
  login: string;
  url: string;
  password: string;
  tagIds: number[];
  allowWeakPassword: boolean;
};
export function EntryForm({
  value,
  onChange,
  errors,
  tags,
  mode = "add",
  weakPassword = false,
  passwordFeedback,
  tools,
  ...form
}: FormPresentation<EntryDraft> & {
  tags: readonly TagOption[];
  mode?: "add" | "edit";
  weakPassword?: boolean;
  passwordFeedback?: ReactNode;
  tools?: ReactNode;
}) {
  const id = useId();
  return (
    <FormFrame {...form} label={mode === "add" ? "Add entry" : "Save entry"}>
      <TextField
        label="Login"
        autoComplete="username"
        value={value.login}
        onChange={(e) => onChange({ ...value, login: e.target.value })}
        error={errors?.login}
      />
      <TextField
        label="Website"
        type="url"
        value={value.url}
        onChange={(e) => onChange({ ...value, url: e.target.value })}
        error={errors?.url}
      />
      <FormPassword
        label="Password"
        value={value.password}
        onChange={(password) =>
          onChange({ ...value, password, allowWeakPassword: false })
        }
        error={errors?.password}
      />
      {passwordFeedback}
      {tools}
      <TagSelection
        options={tags}
        value={value.tagIds}
        onChange={(tagIds) => onChange({ ...value, tagIds })}
        error={errors?.tagIds}
      />
      {weakPassword ? (
        <FieldLabel id={id}>
          <Checkbox
            checked={value.allowWeakPassword}
            aria-labelledby={id}
            onCheckedChange={(allowWeakPassword) =>
              onChange({ ...value, allowWeakPassword })
            }
          />
          Save with this weak password
        </FieldLabel>
      ) : null}
    </FormFrame>
  );
}
