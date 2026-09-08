import type { FormPresentation } from "@/ui/components/forms/form-state.type";
import { FormFrame, FormPassword } from "@/ui/components/forms/form-frame.view";
import type { ReactNode } from "react";
import { useId } from "react";
import { TextField } from "@/ui/components/forms/fields.view";
import { Checkbox } from "@/ui/components/primitives/checkbox";
import { FieldLabel } from "@/ui/components/primitives/field";
import { TagSelection, type TagOption } from "./tag-selection.view";
import type { GlobalTagDefinition } from "@lfspm/core";
import {
  tagGroupPresentations,
  type TagGroupPresentation,
} from "@/ui/features/tags";
import type { FolderId, ReadFoldersResult } from "@lfspm/core";
import { FolderPicker, type FolderChoice } from "@/ui/features/folders";
export type EntryDraft = {
  login: string;
  url: string;
  password: string;
  tagIds: string[];
  folderId: FolderId;
  allowWeakPassword: boolean;
  withoutPassword?: boolean;
};
export function EntryForm({
  value,
  onChange,
  errors,
  tags,
  tagGroups = tagGroupPresentations,
  tagSuggestions,
  onCreateTag,
  folders = [],
  uncategorized = {
    id: "uncategorized",
    name: "Uncategorized",
    entryCount: 0,
  },
  onCreateFolder,
  mode = "add",
  weakPassword = false,
  passwordFeedback,
  tools,
  ...form
}: FormPresentation<EntryDraft> & {
  canSubmit?: boolean;
  tags: readonly TagOption[];
  tagGroups?: readonly TagGroupPresentation[];
  tagSuggestions?: readonly GlobalTagDefinition[];
  onCreateTag?: Parameters<typeof TagSelection>[0]["onCreate"];
  folders?: readonly FolderChoice[];
  uncategorized?: ReadFoldersResult["uncategorized"];
  onCreateFolder?: () => void;
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
      {!value.password ? (
        <FieldLabel id={`${id}-passwordless`}>
          <Checkbox
            aria-labelledby={`${id}-passwordless`}
            checked={value.withoutPassword ?? false}
            onCheckedChange={(withoutPassword) =>
              onChange({ ...value, withoutPassword })
            }
          />
          This account uses an email sign-in link
        </FieldLabel>
      ) : null}
      {value.withoutPassword && !value.password ? (
        <p className="text-sm text-muted-foreground">
          No password is stored for this account.
        </p>
      ) : (
        <FormPassword
          label="Password"
          value={value.password}
          onChange={(password) =>
            onChange({
              ...value,
              password,
              allowWeakPassword: false,
              withoutPassword: false,
            })
          }
          error={errors?.password}
        />
      )}
      {passwordFeedback}
      {tools}
      <FolderPicker
        folders={folders}
        uncategorized={uncategorized}
        value={value.folderId}
        disabled={form.state === "pending"}
        onChange={(folderId) => onChange({ ...value, folderId })}
        onCreate={onCreateFolder}
      />
      <TagSelection
        options={tags}
        groups={tagGroups}
        suggestions={tagSuggestions}
        onCreate={onCreateTag}
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
