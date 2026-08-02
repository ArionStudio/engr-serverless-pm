import { toVisiblePasswordEntryFields } from "../entry/password-entry.mapper";
import type {
  EntryReviewItem,
  ReviewableEntry,
  VisibleEntryReviewItem,
  VisibleReviewableEntry,
} from "./entry-review.type";

export function toVisibleEntryReviewItem(
  review: EntryReviewItem,
): VisibleEntryReviewItem {
  return {
    entryId: review.entryId,
    relation: review.relation,
    localEntry: toVisibleReviewableEntry(review.localEntry),
    remoteEntry: toVisibleReviewableEntry(review.remoteEntry),
    passwordChanged: havePasswordsChanged(
      review.localEntry,
      review.remoteEntry,
    ),
    preselectedAction: review.preselectedAction,
  };
}

function toVisibleReviewableEntry(
  entryState: ReviewableEntry,
): VisibleReviewableEntry {
  if (entryState.state === "entry") {
    return {
      state: "entry",
      entry: toVisiblePasswordEntryFields(entryState.entry),
    };
  }

  if (entryState.state === "deleted") {
    return {
      state: "deleted",
      deletedEntry: {
        id: entryState.deletedEntry.id,
        deletedAt: entryState.deletedEntry.deletedAt,
      },
    };
  }

  return { state: "missing" };
}

function havePasswordsChanged(
  localEntry: ReviewableEntry,
  remoteEntry: ReviewableEntry,
): boolean {
  return (
    localEntry.state === "entry" &&
    remoteEntry.state === "entry" &&
    localEntry.entry.password !== remoteEntry.entry.password
  );
}
