import { useId } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "../primitives/alert-dialog";
import { Button } from "../primitives/button";
import { Checkbox } from "../primitives/checkbox";
import { FieldLabel } from "../primitives/field";
import { ActionFeedback } from "./action-feedback.view";
export function DestructiveConfirmation({
  open,
  onOpenChange,
  action,
  identity,
  consequences,
  acknowledgment,
  acknowledged = false,
  onAcknowledge,
  onConfirm,
  pending = false,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: string;
  identity: string;
  consequences: string;
  acknowledgment?: string;
  acknowledged?: boolean;
  onAcknowledge?: (value: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
  error?: string;
}) {
  const id = useId();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <AlertDialogContent initialFocus={() => document.getElementById(id)}>
        <AlertDialogTitle>
          {action}: {identity}
        </AlertDialogTitle>
        <AlertDialogDescription>{consequences}</AlertDialogDescription>
        {acknowledgment ? (
          <FieldLabel id={`${id}-ack`} className="my-4">
            <Checkbox
              aria-labelledby={`${id}-ack`}
              checked={acknowledged}
              onCheckedChange={onAcknowledge}
              disabled={pending}
            />
            {acknowledgment}
          </FieldLabel>
        ) : null}
        <ActionFeedback state={error ? "error" : "idle"} message={error} />
        <AlertDialogFooter>
          <Button
            id={id}
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending || (!!acknowledgment && !acknowledged)}
            onClick={onConfirm}
          >
            {pending ? "Working…" : action}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
