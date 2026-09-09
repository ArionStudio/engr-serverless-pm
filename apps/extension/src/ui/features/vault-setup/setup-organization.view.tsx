import type {
  GlobalLibrary,
  TagColor,
  TagGroupId,
  TagShade,
} from "@lfspm/core";
import {
  Briefcase03Icon,
  CodeCircleIcon,
  Folder01Icon,
  Home08Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useMemo } from "react";
import { Button } from "@/ui/components/primitives/button";
import { Card } from "@/ui/components/primitives/card";
import { Input } from "@/ui/components/primitives/input";
import { FieldError } from "@/ui/components/primitives/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/ui/components/primitives/radio-group";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/ui/components/primitives/tabs";
import {
  TagPill,
  TagVisualPicker,
  type TagGroupPresentation,
} from "@/ui/features/tags";
import {
  createOrganizationSetupDraft,
  findOrganizationSetupNameConflicts,
  type OrganizationSetupDraft,
} from "./setup-organization";
import { useOperationErrorFocus } from "./use-operation-error-focus";

const templateIcons = {
  archetype_standard_v1: Briefcase03Icon,
  archetype_developer_v1: CodeCircleIcon,
  archetype_family_v1: Home08Icon,
} as const;

function templateSummary(library: GlobalLibrary, templateId: string) {
  const template = library.templates.find(({ id }) => id === templateId);
  if (!template) return "";
  const folders = library.folders
    .filter(({ id }) => template.folderIds.includes(id))
    .map(({ name }) => name)
    .join(", ");
  const tags = library.tags
    .filter(({ id }) => template.tagIds.includes(id))
    .map(({ name }) => name)
    .join(", ");
  return { folders, tags };
}

function descendantFolderIds(
  folderId: string,
  folders: OrganizationSetupDraft["folders"],
) {
  const descendants = new Set<string>();
  const pending = [folderId];
  while (pending.length > 0) {
    const parentId = pending.pop();
    for (const folder of folders) {
      if (folder.parentId !== parentId || descendants.has(folder.id)) continue;
      descendants.add(folder.id);
      pending.push(folder.id);
    }
  }
  return descendants;
}

export function SetupOrganization({
  library,
  value,
  onChange,
  onBack,
  onContinue,
  pending = false,
  error,
}: {
  library: GlobalLibrary;
  value: OrganizationSetupDraft;
  onChange: (value: OrganizationSetupDraft) => void;
  onBack: () => void;
  onContinue: () => void;
  pending?: boolean;
  error?: string;
}) {
  const id = useId();
  const errorRef = useOperationErrorFocus(error);
  const groups = library.tagGroups as readonly TagGroupPresentation[];
  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );
  const nameConflicts = useMemo(
    () => findOrganizationSetupNameConflicts(value),
    [value],
  );
  const folderNameErrors = new Map(
    value.folders.flatMap((folder) => {
      const error = !folder.name.trim()
        ? "Enter a folder name."
        : nameConflicts.folderIds.has(folder.id)
          ? "Use a unique name among folders in this location."
          : undefined;
      return error ? [[folder.id, error] as const] : [];
    }),
  );
  const tagNameErrors = new Map(
    value.tags.flatMap((tag) => {
      const error = !tag.name.trim()
        ? "Enter a tag name."
        : nameConflicts.tagIds.has(tag.id)
          ? "Use a unique tag name."
          : undefined;
      return error ? [[tag.id, error] as const] : [];
    }),
  );
  return (
    <section className="space-y-8">
      <h1 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
        Organize your vault
      </h1>
      {error ? (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          data-focus-target
          className="text-sm text-destructive outline-none"
        >
          {error}
        </p>
      ) : null}
      <fieldset
        disabled={pending}
        className="min-w-0 space-y-8"
        aria-busy={pending}
      >
        <RadioGroup
          disabled={pending}
          aria-labelledby={`${id}-title`}
          value={value.templateId ?? "none"}
          onValueChange={(templateId) =>
            onChange(
              createOrganizationSetupDraft(
                library,
                templateId === "none"
                  ? null
                  : typeof templateId === "string"
                    ? templateId
                    : null,
              ),
            )
          }
          className="grid gap-4 @2xl:grid-cols-2"
        >
          {library.templates.map((template) => {
            const summary = templateSummary(library, template.id);
            const labelId = `${id}-${template.id}`;
            return (
              <Card
                key={template.id}
                className="border p-0 ring-0 has-[[data-checked]]:border-primary has-[[data-checked]]:bg-accent/35"
              >
                <label className="flex h-full cursor-pointer flex-col gap-4 p-5">
                  <span className="flex items-start justify-between gap-4">
                    <span className="grid size-10 place-items-center rounded-lg bg-primary/12 text-primary">
                      <HugeiconsIcon
                        icon={
                          templateIcons[
                            template.id as keyof typeof templateIcons
                          ] ?? Folder01Icon
                        }
                        size={22}
                        aria-hidden="true"
                      />
                    </span>
                    <RadioGroupItem
                      disabled={pending}
                      value={template.id}
                      aria-labelledby={labelId}
                    />
                  </span>
                  <span id={labelId} className="text-lg font-semibold">
                    {template.label}
                  </span>
                  <span className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                    <span className="block">
                      <strong className="font-medium text-foreground">
                        Folders:
                      </strong>{" "}
                      {summary && summary.folders}
                    </span>
                    <span className="block">
                      <strong className="font-medium text-foreground">
                        Tags:
                      </strong>{" "}
                      {summary && summary.tags}
                    </span>
                  </span>
                </label>
              </Card>
            );
          })}
          <Card className="border p-0 ring-0 has-[[data-checked]]:border-primary has-[[data-checked]]:bg-accent/35">
            <label className="flex h-full cursor-pointer items-center gap-4 p-5">
              <RadioGroupItem
                value="none"
                aria-labelledby={`${id}-none`}
                disabled={pending}
              />
              <span id={`${id}-none`} className="text-sm font-medium">
                Start without folders or tags
              </span>
            </label>
          </Card>
        </RadioGroup>

        {value.folders.length || value.tags.length ? (
          <Tabs
            defaultValue="folders"
            className="rounded-xl border bg-card p-5"
          >
            <TabsList className="mb-5 h-auto w-full flex-col p-1 @lg:h-10 @lg:flex-row">
              <TabsTrigger
                value="folders"
                disabled={pending}
                className="w-full justify-start after:hidden px-4 py-2 text-sm @lg:w-auto @lg:justify-center"
              >
                Folders ({value.folders.length}
                {folderNameErrors.size
                  ? `, ${folderNameErrors.size} need attention`
                  : ""}
                )
              </TabsTrigger>
              <TabsTrigger
                value="tags"
                disabled={pending}
                className="w-full justify-start after:hidden px-4 py-2 text-sm @lg:w-auto @lg:justify-center"
              >
                Tags ({value.tags.length}
                {tagNameErrors.size
                  ? `, ${tagNameErrors.size} need attention`
                  : ""}
                )
              </TabsTrigger>
            </TabsList>
            <TabsContent value="folders" className="space-y-3 text-sm">
              {value.folders.map((folder) => {
                const unavailableParents = descendantFolderIds(
                  folder.id,
                  value.folders,
                );
                const nameError = folderNameErrors.get(folder.id);
                const nameId = `${id}-folder-${folder.id}-name`;
                return (
                  <div
                    key={folder.id}
                    className="grid gap-4 rounded-lg border bg-background p-4 @xl:grid-cols-2"
                  >
                    <div className="space-y-2">
                      <label className="block font-medium" htmlFor={nameId}>
                        Folder name
                      </label>
                      <Input
                        id={nameId}
                        value={folder.name}
                        maxLength={64}
                        aria-invalid={!!nameError}
                        aria-describedby={
                          nameError ? `${nameId}-error` : undefined
                        }
                        onChange={(event) =>
                          onChange({
                            ...value,
                            folders: value.folders.map((candidate) =>
                              candidate.id === folder.id
                                ? { ...candidate, name: event.target.value }
                                : candidate,
                            ),
                          })
                        }
                      />
                      {nameError ? (
                        <FieldError id={`${nameId}-error`}>
                          {nameError}
                        </FieldError>
                      ) : null}
                    </div>
                    <label className="space-y-2">
                      <span className="block font-medium">Location</span>
                      <NativeSelect
                        size="lg"
                        className="w-full"
                        value={folder.parentId ?? ""}
                        onChange={(event) =>
                          onChange({
                            ...value,
                            folders: value.folders.map((candidate) =>
                              candidate.id === folder.id
                                ? {
                                    ...candidate,
                                    parentId: event.target.value || null,
                                  }
                                : candidate,
                            ),
                          })
                        }
                      >
                        <NativeSelectOption value="">
                          Vault root
                        </NativeSelectOption>
                        {value.folders.map((candidate) => (
                          <NativeSelectOption
                            key={candidate.id}
                            value={candidate.id}
                            disabled={
                              candidate.id === folder.id ||
                              unavailableParents.has(candidate.id)
                            }
                          >
                            {candidate.name || "Unnamed folder"}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </label>
                  </div>
                );
              })}
            </TabsContent>
            <TabsContent value="tags" className="space-y-4 text-sm">
              {value.tags.map((tag) => {
                const group =
                  groupById.get(tag.groupId) ?? groups[groups.length - 1];
                const nameError = tagNameErrors.get(tag.id);
                const nameId = `${id}-tag-${tag.id}-name`;
                return (
                  <div
                    key={tag.id}
                    className="space-y-5 rounded-lg border bg-background p-4"
                  >
                    <div className="grid gap-3 @xl:grid-cols-[1fr_auto] @xl:items-center">
                      <div className="space-y-2">
                        <label className="block font-medium" htmlFor={nameId}>
                          Tag name
                        </label>
                        <Input
                          id={nameId}
                          value={tag.name}
                          maxLength={32}
                          aria-invalid={!!nameError}
                          aria-describedby={
                            nameError ? `${nameId}-error` : undefined
                          }
                          onChange={(event) =>
                            onChange({
                              ...value,
                              tags: value.tags.map((candidate) =>
                                candidate.id === tag.id
                                  ? { ...candidate, name: event.target.value }
                                  : candidate,
                              ),
                            })
                          }
                        />
                        {nameError ? (
                          <FieldError id={`${nameId}-error`}>
                            {nameError}
                          </FieldError>
                        ) : null}
                      </div>
                      {group ? (
                        <TagPill
                          name={tag.name || "Unnamed tag"}
                          group={group}
                          color={tag.color}
                          shade={tag.shade}
                        />
                      ) : null}
                    </div>
                    <TagVisualPicker
                      disabled={pending}
                      groupId={tag.groupId}
                      color={tag.color}
                      shade={tag.shade}
                      groups={groups}
                      onChange={(next: {
                        groupId: TagGroupId;
                        color: TagColor;
                        shade: TagShade;
                      }) =>
                        onChange({
                          ...value,
                          tags: value.tags.map((candidate) =>
                            candidate.id === tag.id
                              ? { ...candidate, ...next }
                              : candidate,
                          ),
                        })
                      }
                    />
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        ) : null}

        <div className="flex flex-wrap justify-between gap-3 border-t pt-6">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (!pending) onBack();
            }}
          >
            Back to device
          </Button>
          <Button
            type="button"
            disabled={
              pending || folderNameErrors.size > 0 || tagNameErrors.size > 0
            }
            onClick={() => {
              if (!pending) onContinue();
            }}
          >
            {pending ? "Creating vault…" : "Continue to recovery"}
          </Button>
        </div>
      </fieldset>
    </section>
  );
}
