import { useState } from "react";
import type { TagColor, TagGroupId, TagShade } from "@lfspm/core";
import {
  FolderEditor,
  FolderPicker,
  FolderTree,
  MoveFolderDialog,
  type FolderDraft,
  type ManagedFolder,
} from "@/ui/features/folders";
import {
  TagGroupHeading,
  TagPill,
  TagVisualPicker,
  getTagGroupPresentation,
  tagGroupPresentations,
} from "@/ui/features/tags";
import { Scenario, Specimen } from "./specimen.view";
import { Button } from "@/ui/components/primitives/button";
import { globalLibrarySchema } from "@lfspm/core";
import organizationLibrary from "@/assets/data/global-library.json";

const folders: readonly ManagedFolder[] = [
  {
    id: "folder-work",
    name: "Work",
    icon: "briefcase",
    description: "Professional accounts",
    parentId: null,
    createdAt: 1,
    versionVector: { gallery: 1 },
    entryCount: 3,
    childCount: 1,
  },
  {
    id: "folder-infrastructure",
    name: "Infrastructure",
    icon: "server",
    parentId: "folder-work",
    createdAt: 2,
    versionVector: { gallery: 1 },
    entryCount: 1,
    childCount: 0,
  },
  {
    id: "folder-personal",
    name: "Personal",
    icon: "home",
    parentId: null,
    createdAt: 3,
    versionVector: { gallery: 1 },
    entryCount: 2,
    childCount: 0,
  },
];

function TagVisualExample({ view }: { view: string }) {
  const [visuals, setVisuals] = useState<{
    groupId: TagGroupId;
    color: TagColor;
    shade: TagShade;
  }>({ groupId: "status", color: "orange", shade: 500 });
  const group = getTagGroupPresentation(visuals.groupId);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <TagPill
          name="MFA"
          group={group}
          color={visuals.color}
          shade={visuals.shade}
        />
        <TagPill
          name="Expiring"
          group={group}
          color="red"
          shade={600}
          size="sm"
        />
      </div>
      {view.startsWith("picker") ? (
        <section
          className={`rounded-lg border bg-card p-4 ${view === "picker-compact" ? "max-w-sm" : ""}`}
        >
          <TagVisualPicker
            {...visuals}
            groups={tagGroupPresentations}
            onChange={setVisuals}
          />
        </section>
      ) : (
        <section className="rounded-lg border bg-card p-4">
          <TagGroupHeading id="gallery-tag-heading" group={group} count={2} />
        </section>
      )}
    </div>
  );
}

function FolderControlExample({ view }: { view: string }) {
  const [selected, setSelected] = useState("folder-infrastructure");
  const [moveOpen, setMoveOpen] = useState(view === "move");
  const [saved, setSaved] = useState<FolderDraft>();
  const uncategorized = {
    id: "uncategorized" as const,
    name: "Uncategorized" as const,
    entryCount: 4,
  };
  if (view === "picker")
    return (
      <FolderPicker
        folders={folders}
        uncategorized={uncategorized}
        value={selected}
        onChange={setSelected}
        onCreate={() => setSelected("uncategorized")}
      />
    );
  if (view === "editor")
    return (
      <div className="space-y-3">
        <FolderEditor
          suggestions={globalLibrarySchema.parse(organizationLibrary).folders}
          parentName="Work"
          deepNesting
          onSubmit={setSaved}
          onCancel={() => setSaved(undefined)}
        />
        {saved ? <p role="status">Folder {saved.name} is ready.</p> : null}
      </div>
    );
  if (view === "move")
    return (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => setMoveOpen(true)}
        >
          Move Infrastructure
        </Button>
        {moveOpen ? (
          <MoveFolderDialog
            folder={folders[1]}
            folders={folders}
            onMove={() => setMoveOpen(false)}
            onOpenChange={setMoveOpen}
          />
        ) : null}
      </>
    );
  return <FolderTree folders={folders} uncategorized={uncategorized} />;
}

export function OrganizationFeatureExamples() {
  return (
    <>
      <Specimen
        id="P30"
        name="Tag visuals"
        owner="Feature controls · tags"
        wide
      >
        <Scenario
          label="Tag visual"
          options={["summary", "picker", "picker-compact"]}
        >
          {(view) => <TagVisualExample key={view} view={view} />}
        </Scenario>
      </Specimen>
      <Specimen
        id="P31"
        name="Folder controls"
        owner="Feature controls · folders"
        wide
      >
        <Scenario
          label="Folder control"
          options={["tree", "picker", "editor", "move"]}
        >
          {(view) => <FolderControlExample key={view} view={view} />}
        </Scenario>
      </Specimen>
    </>
  );
}
