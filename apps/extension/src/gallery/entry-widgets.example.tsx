import { emptyEntryDraft } from "@/ui/features/entries/entry-draft";
import { useState } from "react";
import { exampleEntry, entryToolsFixture } from "./entry-tools-fixture";
import { EntryDetails } from "@/ui/features/entries/entry-details.view";
import { EntryEditor } from "@/ui/features/entries/entry-editor.view";
import { SiteIcon } from "@/ui/features/entries/site-icon.view";
import { Scenario } from "./specimen.view";
import { demoTags } from "./fixtures";
import iconUrl from "../../assets/icon.svg?url&no-inline";
export function EntryDetailsExample() {
  const [password, setPassword] = useState<string>();
  const [copied, setCopied] = useState(false);
  return (
    <Scenario
      label="Entry details behavior"
      options={
        ["ready", "revealing", "copying", "copy-error", "pending"] as const
      }
    >
      {(state) => (
        <EntryDetails
          entry={exampleEntry}
          tagLabels={{ 1: "Personal" }}
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
  return (
    <Scenario
      label="Entry editor behavior"
      options={["add", "edit", "pending", "save-error", "tool-error"] as const}
    >
      {(state) => (
        <EntryEditor
          key={state}
          initial={
            state === "edit"
              ? {
                  ...emptyEntryDraft,
                  login: exampleEntry.login,
                  url: exampleEntry.sanitizedUrl,
                  password: "Gallery-River-8!Pine-Sky",
                }
              : emptyEntryDraft
          }
          mode={state === "edit" ? "edit" : "add"}
          tags={demoTags}
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
