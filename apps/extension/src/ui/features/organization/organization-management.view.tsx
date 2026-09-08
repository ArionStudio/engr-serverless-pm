import { useState } from "react";
import { Folder01Icon, TagsIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/ui/components/primitives/tabs";
import type { FolderManagementCapabilities } from "@/ui/features/folders";
import { FolderManagementView } from "@/ui/features/folders";
import {
  TagManagementView,
  type TagGroupPresentation,
  type TagManagementCapabilities,
} from "@/ui/features/tags";

export type OrganizationSection = "tags" | "folders";

export function OrganizationManagementView({
  vaultId,
  tagCapabilities,
  folderCapabilities,
  tagGroups,
  initialSection = "tags",
  onSessionLost,
}: {
  vaultId: string;
  tagCapabilities: TagManagementCapabilities;
  folderCapabilities: FolderManagementCapabilities;
  tagGroups?: readonly TagGroupPresentation[];
  initialSection?: OrganizationSection;
  onSessionLost?: () => void;
}) {
  const [section, setSection] = useState<OrganizationSection>(initialSection);
  return (
    <Tabs
      value={section}
      onValueChange={(value) => {
        if (value === "tags" || value === "folders") setSection(value);
      }}
    >
      <TabsList aria-label="Organization sections" className="h-10">
        <TabsTrigger value="tags" className="after:hidden px-4 text-sm">
          <HugeiconsIcon icon={TagsIcon} size={17} aria-hidden="true" />
          Tags
        </TabsTrigger>
        <TabsTrigger value="folders" className="after:hidden px-4 text-sm">
          <HugeiconsIcon icon={Folder01Icon} size={17} aria-hidden="true" />
          Folders
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tags" className="pt-4 text-base">
        <TagManagementView
          key={`tags-${vaultId}`}
          vaultId={vaultId}
          capabilities={tagCapabilities}
          groups={tagGroups}
          onSessionLost={onSessionLost}
        />
      </TabsContent>
      <TabsContent value="folders" className="pt-4 text-base">
        <FolderManagementView
          key={`folders-${vaultId}`}
          vaultId={vaultId}
          capabilities={folderCapabilities}
          onSessionLost={onSessionLost}
        />
      </TabsContent>
    </Tabs>
  );
}
