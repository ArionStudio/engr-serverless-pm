import type { VisiblePasswordEntryFields } from "@lfspm/core";
import { DetailField } from "@/ui/components/layout/sections.view";
import {
  SecretField,
  CopyAction,
} from "@/ui/components/feedback/action-feedback.view";
import { Button } from "@/ui/components/primitives/button";
import type { OperationState } from "@/ui/components/forms/form-state.type";
import { SiteIcon } from "./site-icon.view";
import { HugeiconsIcon } from "@hugeicons/react";
import { getFolderIcon } from "@/ui/features/folders";
import { TagPill } from "@/ui/features/tags";
import type { TagOption } from "./tag-selection.view";
import type { EntryFolderPresentation } from "./entries.view";

export function EntryDetails({
  entry,
  tagLabels,
  tagOptions = {},
  folders = {},
  password,
  revealing = false,
  copyState = "idle",
  disabled = false,
  onReveal,
  onHide,
  onCopy,
  onEdit,
  onDelete,
  onBack,
}: {
  entry: VisiblePasswordEntryFields;
  tagLabels: Readonly<Record<string, string>>;
  tagOptions?: Readonly<Record<string, TagOption>>;
  folders?: Readonly<Record<string, EntryFolderPresentation>>;
  password?: string;
  revealing?: boolean;
  copyState?: OperationState;
  disabled?: boolean;
  onReveal: () => void;
  onHide: () => void;
  onCopy: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onBack: () => void;
}) {
  const folder = folders[entry.folderId];
  return (
    <section className="min-w-0 space-y-5" aria-label="Entry details">
      <Button variant="ghost" onClick={onBack} disabled={disabled}>
        Back to entries
      </Button>
      <div className="flex items-center gap-3">
        <SiteIcon url={entry.sanitizedUrl} />
        <h2 className="min-w-0 break-all text-xl font-semibold">
          {entry.login}
        </h2>
      </div>
      <DetailField
        label="Website"
        value={entry.sanitizedUrl}
        url={entry.sanitizedUrl}
      />
      <DetailField label="Login" value={entry.login} />
      {folder ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Folder</p>
          <div className="flex items-center gap-2 text-sm">
            <HugeiconsIcon
              icon={getFolderIcon(folder.icon)}
              size={16}
              className="text-muted-foreground"
              aria-hidden="true"
            />
            <span>{folder.name}</span>
          </div>
        </div>
      ) : null}
      {entry.tags.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Tags">
          {entry.tags.map((id) => {
            const option = tagOptions[id];
            return option ? (
              <TagPill
                key={id}
                name={option.label}
                group={option.group}
                color={option.color}
                shade={option.shade}
              />
            ) : (
              <span
                key={id}
                className="rounded-md border bg-muted/45 px-2.5 py-1 text-sm"
              >
                {tagLabels[id] ?? "Unknown tag"}
              </span>
            );
          })}
        </div>
      ) : null}
      {entry.hasPassword ? (
        <>
          <SecretField
            label="Password"
            state={
              revealing
                ? "pending"
                : disabled
                  ? "disabled"
                  : password !== undefined
                    ? "revealed"
                    : "concealed"
            }
            value={password}
            onReveal={onReveal}
            onHide={onHide}
          />
          <fieldset disabled={disabled || revealing} className="min-w-0">
            <CopyAction
              label="Copy password"
              state={copyState}
              onCopy={onCopy}
            />
          </fieldset>
          <p className="text-xs text-muted-foreground">
            The copied password is cleared after 30 seconds if the clipboard
            still contains it.
          </p>
        </>
      ) : (
        <DetailField
          label="Sign-in method"
          value="Email sign-in link · No password stored"
        />
      )}
      {onEdit || onDelete ? (
        <div className="flex flex-wrap gap-3 border-t pt-5">
          {onEdit ? (
            <Button disabled={disabled} onClick={onEdit}>
              Edit entry
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              disabled={disabled}
              variant="destructive"
              onClick={onDelete}
            >
              Delete entry
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
