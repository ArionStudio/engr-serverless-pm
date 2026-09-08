import type { TagGroup } from "./tag-group.type";

const DEFAULT_TAG_GROUPS = [
  {
    id: "status",
    name: "Status",
    icon: "bell",
    baseColor: "orange",
    description: "Account and credential status",
  },
  {
    id: "topic",
    name: "Topic",
    icon: "tag",
    baseColor: "blue",
    description: "Subject and purpose",
  },
  {
    id: "environment",
    name: "Environment",
    icon: "layers",
    baseColor: "purple",
    description: "Deployment environment",
  },
  {
    id: "access",
    name: "Access",
    icon: "shield-keyhole",
    baseColor: "green",
    description: "Access scope",
  },
  {
    id: "other",
    name: "Other",
    icon: "hash",
    baseColor: "gray",
    description: "Custom context",
  },
] as const satisfies readonly TagGroup[];

export function createDefaultTagGroups(): TagGroup[] {
  return DEFAULT_TAG_GROUPS.map((group) => ({ ...group }));
}
