import type { VisiblePasswordEntryFields } from "@lfspm/core";
import { DetailField } from "@/ui/components/layout/sections.view";
import {
  SecretField,
  CopyAction,
} from "@/ui/components/feedback/action-feedback.view";
import { Button } from "@/ui/components/primitives/button";
import { Badge } from "@/ui/components/primitives/badge";
import type { OperationState } from "@/ui/components/forms/form-state.type";
import { SiteIcon } from "./site-icon.view";

export function EntryDetails({
  entry,
  tagLabels,
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
  tagLabels: Readonly<Record<number, string>>;
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
      {entry.tags.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Tags">
          {entry.tags.map((id) => (
            <Badge key={id} variant="outline">
              {tagLabels[id] ?? "Unknown tag"}
            </Badge>
          ))}
        </div>
      ) : null}
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
        <CopyAction label="Copy password" state={copyState} onCopy={onCopy} />
      </fieldset>
      <p className="text-xs text-muted-foreground">
        The copied password is cleared after 30 seconds if the clipboard still
        contains it.
      </p>
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
