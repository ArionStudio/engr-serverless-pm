import { emptyEntryDraft } from "@/ui/features/entries/entry-draft";
import { useState } from "react";
import { exampleEntry, entryToolsFixture } from "./entry-tools-fixture";
import { EntryDetails } from "@/ui/features/entries/entry-details.view";
import { EntryEditor } from "@/ui/features/entries/entry-editor.view";
import { SiteIcon } from "@/ui/features/entries/site-icon.view";
import { Scenario } from "./specimen.view";
import { demoTags } from "./fixtures";
import { tagGroupPresentations } from "@/ui/features/tags";
import { globalLibrarySchema, PASSWORD_ENTRY_TAG_LIMIT } from "@lfspm/core";
import organizationLibrary from "@/assets/data/global-library.json";
import type { FolderChoice } from "@/ui/features/folders";
import iconUrl from "../../assets/icon.svg?url&no-inline";
export function EntryDetailsExample() {
  const [password, setPassword] = useState<string>();
  const [copied, setCopied] = useState(false);
  return (
    <Scenario
      label="Entry details behavior"
      options={
        [
          "ready",
          "email-link",
          "revealing",
          "copying",
          "copy-error",
          "pending",
        ] as const
      }
    >
      {(state) => (
        <EntryDetails
          entry={{
            ...exampleEntry,
            folderId: "uncategorized",
            hasPassword: state !== "email-link",
          }}
          tagLabels={{ "tag-personal": "Personal" }}
          password={password}
          revealing={state === "revealing"}
          disabled={
            state === "pending" || state === "revealing" || state === "copying"
          }
          copyState={
            state === "copying"
              ? "pending"
              : state === "copy-error"
                ? "error"
                : copied
                  ? "success"
                  : "idle"
          }
          onReveal={() => setPassword("Gallery-River-8!Pine-Sky")}
          onHide={() => setPassword(undefined)}
          onCopy={() => setCopied(true)}
          onBack={() => {
            setPassword(undefined);
            setCopied(false);
          }}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      )}
    </Scenario>
  );
}
export function SiteIconExample() {
  return (
    <Scenario
      label="Site icon behavior"
      options={["loaded", "loading", "unavailable", "failed"] as const}
    >
      {(state) => (
        <div className="flex items-center gap-3">
          <SiteIcon
            url={exampleEntry.sanitizedUrl}
            source={iconUrl}
            state={state}
          />
          <span>mail.example.test</span>
        </div>
      )}
    </Scenario>
  );
}
export function EntryEditorExample() {
  const [folders, setFolders] = useState<FolderChoice[]>([
    {
      id: "gallery-work",
      name: "Work",
      icon: "briefcase",
      parentId: null,
      createdAt: 1,
      entryCount: 0,
      childCount: 1,
    },
    {
      id: "gallery-projects",
      name: "Projects",
      icon: "folder",
      parentId: "gallery-work",
      createdAt: 1,
      entryCount: 0,
      childCount: 0,
    },
  ]);
  return (
    <Scenario
      label="Entry editor behavior"
      options={
        [
          "add",
          "email-link",
          "edit",
          "pending",
          "save-error",
          "tool-error",
          "tag-limit",
          "folder-suggestions",
        ] as const
      }
    >
      {(state) => (
        <EntryEditor
          key={state}
          initial={
            state === "tag-limit"
              ? {
                  ...emptyEntryDraft,
                  tagIds: Array.from(
                    { length: PASSWORD_ENTRY_TAG_LIMIT },
                    (_, index) => `limit-${index}`,
                  ),
                }
              : state === "edit"
                ? {
                    ...emptyEntryDraft,
                    login: exampleEntry.login,
                    url: exampleEntry.sanitizedUrl,
                    password: "Gallery-River-8!Pine-Sky",
                  }
                : state === "email-link"
                  ? {
                      ...emptyEntryDraft,
                      login: "alex@example.com",
                      url: "https://example.com",
                      withoutPassword: true,
                    }
                  : emptyEntryDraft
          }
          mode={state === "edit" ? "edit" : "add"}
          tags={
            state === "tag-limit"
              ? Array.from(
                  { length: PASSWORD_ENTRY_TAG_LIMIT + 1 },
                  (_, index) => ({
                    ...demoTags[0],
                    id: `limit-${index}`,
                    label: `Tag ${index + 1}`,
                  }),
                )
              : demoTags
          }
          tagGroups={tagGroupPresentations}
          folderSuggestions={globalLibrarySchema
            .parse(organizationLibrary)
            .folders.map((folder) =>
              state === "folder-suggestions" && folder.name === "Clients"
                ? { ...folder, parent: "ｗｏｒｋ" }
                : folder,
            )}
          folders={state === "folder-suggestions" ? folders : []}
          onCreateFolder={
            state === "folder-suggestions"
              ? async (folder) => {
                  const id = `gallery-created-folder-${folders.length}`;
                  setFolders((current) => [
                    ...current,
                    {
                      ...folder,
                      id,
                      createdAt: 1,
                      entryCount: 0,
                      childCount: 0,
                    },
                  ]);
                  return { id };
                }
              : undefined
          }
          tools={
            state === "tool-error"
              ? {
                  ...entryToolsFixture,
                  generate: async () => {
                    throw new Error("Unavailable");
                  },
                }
              : entryToolsFixture
          }
          pending={state === "pending"}
          error={
            state === "save-error"
              ? "Could not save this entry. Your draft is still available."
              : undefined
          }
          onSave={() => {}}
          onCancel={() => {}}
        />
      )}
    </Scenario>
  );
}
