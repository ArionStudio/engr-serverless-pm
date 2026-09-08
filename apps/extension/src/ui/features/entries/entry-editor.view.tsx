import { useEffect, useRef, useState } from "react";
import { EntryForm, type EntryDraft } from "./entry-form.view";
import type { TagOption } from "./tag-selection.view";
import type {
  AddFolderCommandParams,
  GlobalTagDefinition,
  GlobalFolderDefinition,
  ReadFoldersResult,
} from "@lfspm/core";
import {
  PASSWORD_ENTRY_TAG_LIMIT,
  resolveSuggestedFolderParent,
} from "@lfspm/core";
import {
  tagGroupPresentations,
  type TagGroupPresentation,
} from "@/ui/features/tags";
import { PasswordStrengthFeedback } from "@/ui/components/forms/fields.view";
import { Button } from "@/ui/components/primitives/button";
import {
  GeneratorControls,
  UsernameControls,
} from "@/ui/features/password-tools/generator.view";

import type { EntryTools } from "@/ui/features/password-tools/password-tools.type";
import { defaultPasswordSettings } from "@/ui/features/password-tools/generator-settings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/primitives/dialog";
import {
  FolderEditor,
  folderDepth,
  type FolderChoice,
  type FolderDraft,
} from "@/ui/features/folders";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";

export function EntryEditor({
  initial,
  mode,
  tags,
  tagGroups = tagGroupPresentations,
  tagSuggestions,
  folderSuggestions,
  onCreateTag,
  folders = [],
  uncategorized = {
    id: "uncategorized",
    name: "Uncategorized",
    entryCount: 0,
  },
  onCreateFolder,
  tools,
  pending = false,
  error,
  onSave,
  onCancel,
}: {
  initial: EntryDraft;
  mode: "add" | "edit";
  tags: readonly TagOption[];
  tagGroups?: readonly TagGroupPresentation[];
  tagSuggestions?: readonly GlobalTagDefinition[];
  folderSuggestions?: readonly GlobalFolderDefinition[];
  onCreateTag?: Parameters<
    typeof import("./tag-selection.view").TagSelection
  >[0]["onCreate"];
  folders?: readonly FolderChoice[];
  uncategorized?: ReadFoldersResult["uncategorized"];
  onCreateFolder?: (
    folder: AddFolderCommandParams["folder"],
  ) => Promise<{ readonly id: string }>;
  tools: EntryTools;
  pending?: boolean;
  error?: string;
  onSave: (draft: EntryDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [settings, setSettings] = useState(defaultPasswordSettings);
  const [username, setUsername] = useState({
    capitalize: false,
    includeNumber: true,
  });
  const [generating, setGenerating] = useState(false);
  const [toolError, setToolError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [folderCreation, setFolderCreation] = useState(false);
  const [folderParentId, setFolderParentId] = useState<string | null>(null);
  const [folderPending, setFolderPending] = useState(false);
  const [folderError, setFolderError] = useState<string>();
  const [assessment, setAssessment] = useState<
    { score: 0 | 1 | 2 | 3 | 4 } | "error"
  >();
  const [submitted, setSubmitted] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      ++generation.current;
    },
    [],
  );
  useEffect(() => {
    let current = true;
    if (!draft.password) return;
    const timer = setTimeout(() => {
      void tools.assess(draft.password).then(
        (result) => {
          if (current) setAssessment(result);
        },
        () => {
          if (current) setAssessment("error");
        },
      );
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [draft.password, tools, attempt]);
  const score =
    assessment && assessment !== "error" ? assessment.score : undefined;
  function change(next: EntryDraft) {
    if (next.password !== draft.password) setAssessment(undefined);
    setDraft(next);
  }
  async function generate(kind: "password" | "username") {
    if (generating || pending) return;
    const owner = ++generation.current;
    setGenerating(true);
    setToolError(undefined);
    try {
      if (kind === "password") {
        const result = await tools.generate(settings);
        if (owner === generation.current) {
          setAssessment(undefined);
          setDraft((previous) => ({
            ...previous,
            password: result.password,
            withoutPassword: false,
            allowWeakPassword: false,
          }));
        }
      } else {
        const result = await tools.username(username);
        if (owner === generation.current)
          setDraft((previous) => ({ ...previous, login: result.username }));
      }
    } catch {
      if (owner === generation.current)
        setToolError(
          "Could not generate a value. Check the selected options and try again.",
        );
    } finally {
      if (owner === generation.current) setGenerating(false);
    }
  }
  async function createFolder(folder: FolderDraft) {
    if (!onCreateFolder || folderPending) return;
    setFolderPending(true);
    setFolderError(undefined);
    try {
      const result = await onCreateFolder({
        ...folder,
        parentId: folderParentId,
      });
      setDraft((current) => ({ ...current, folderId: result.id }));
      setFolderCreation(false);
      setFolderParentId(null);
    } catch {
      setFolderError(
        "Could not create this folder. Use a different name or try again.",
      );
    } finally {
      setFolderPending(false);
    }
  }
  const passwordless = draft.withoutPassword === true && draft.password === "";
  const tagError =
    draft.tagIds.length > PASSWORD_ENTRY_TAG_LIMIT
      ? `Choose up to ${PASSWORD_ENTRY_TAG_LIMIT} tags.`
      : undefined;
  const passwordError = passwordless
    ? undefined
    : !draft.password
      ? "Enter a password."
      : score !== 4 && !draft.allowWeakPassword
        ? "Use a strong password or explicitly allow this existing weak password."
        : undefined;
  return (
    <section
      className="max-w-xl space-y-6"
      aria-label={mode === "add" ? "Add entry" : "Edit entry"}
    >
      <h2 className="text-xl font-semibold">
        {mode === "add" ? "Add entry" : "Edit entry"}
      </h2>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <EntryForm
        value={draft}
        onChange={change}
        mode={mode}
        tags={tags}
        tagGroups={tagGroups}
        tagSuggestions={tagSuggestions}
        onCreateTag={onCreateTag}
        folders={folders}
        uncategorized={uncategorized}
        onCreateFolder={
          onCreateFolder
            ? () => {
                setFolderError(undefined);
                setFolderCreation(true);
              }
            : undefined
        }
        state={pending || generating ? "pending" : "idle"}
        canSubmit={
          passwordless || (assessment !== undefined && assessment !== "error")
        }
        errors={
          submitted
            ? {
                login: !draft.login.trim() ? "Enter a login." : undefined,
                url: !draft.url ? "Enter a website." : undefined,
                password: passwordError,
                tagIds: tagError,
              }
            : undefined
        }
        weakPassword={!!draft.password && score !== undefined && score < 4}
        onCancel={onCancel}
        onSubmit={() => {
          setSubmitted(true);
          if (
            !pending &&
            !generating &&
            draft.login.trim() &&
            draft.url &&
            !passwordError &&
            !tagError &&
            (passwordless || (assessment && assessment !== "error"))
          )
            onSave(draft);
        }}
        passwordFeedback={
          draft.password ? (
            <>
              <PasswordStrengthFeedback
                score={score}
                state={
                  assessment === "error"
                    ? "unavailable"
                    : assessment
                      ? "ready"
                      : "pending"
                }
              />
              {assessment === "error" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAssessment(undefined);
                    setAttempt((n) => n + 1);
                  }}
                >
                  Try strength check again
                </Button>
              ) : null}
            </>
          ) : null
        }
        tools={
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Password and username tools
            </summary>
            <div className="mt-5 space-y-6">
              {toolError ? (
                <p role="alert" className="text-sm text-destructive">
                  {toolError}
                </p>
              ) : null}
              <GeneratorControls
                value={settings}
                onChange={setSettings}
                pending={generating || pending}
                onGenerate={() => void generate("password")}
              />
              <div className="border-t pt-5">
                <UsernameControls
                  {...username}
                  onChange={setUsername}
                  onGenerate={() => void generate("username")}
                />
              </div>
            </div>
          </details>
        }
      />
      <Dialog
        open={folderCreation}
        onOpenChange={(open) => {
          if (!open && !folderPending) setFolderCreation(false);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create folder</DialogTitle>
          </DialogHeader>
          <label className="space-y-2 text-sm font-medium">
            <span className="block">Location</span>
            <NativeSelect
              className="w-full"
              value={folderParentId ?? ""}
              disabled={folderPending}
              onChange={(event) =>
                setFolderParentId(event.target.value || null)
              }
            >
              <NativeSelectOption value="">Vault root</NativeSelectOption>
              {folders.map((folder) => (
                <NativeSelectOption key={folder.id} value={folder.id}>
                  {folder.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <FolderEditor
            suggestions={folderSuggestions}
            onSuggestionSelected={(suggestion) => {
              if (suggestion.parent === null) setFolderParentId(null);
              else {
                const parentId = resolveSuggestedFolderParent(
                  folders,
                  suggestion.parent,
                );
                if (parentId) setFolderParentId(parentId);
              }
            }}
            deepNesting={folderDepth(folderParentId, folders) + 1 > 2}
            parentName={
              folders.find(({ id }) => id === folderParentId)?.name ??
              "Vault root"
            }
            pending={folderPending}
            error={folderError}
            onSubmit={(folder) => void createFolder(folder)}
            onCancel={() => setFolderCreation(false)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
