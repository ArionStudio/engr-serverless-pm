import type { TagColor, TagGroupId, TagShade } from "@lfspm/core";
import {
  HashIcon,
  Layers01Icon,
  Notification02Icon,
  ShieldKeyIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export type TagGroupPresentation = {
  readonly id: TagGroupId;
  readonly name: string;
  readonly description?: string;
  readonly icon: string;
  readonly baseColor: TagColor;
};

export const tagGroupPresentations: readonly TagGroupPresentation[] = [
  {
    id: "status",
    name: "Status",
    description: "Account and credential status",
    icon: "bell",
    baseColor: "orange",
  },
  {
    id: "topic",
    name: "Topic",
    description: "Subject and purpose",
    icon: "tag",
    baseColor: "blue",
  },
  {
    id: "environment",
    name: "Environment",
    description: "Deployment environment",
    icon: "layers",
    baseColor: "purple",
  },
  {
    id: "access",
    name: "Access",
    description: "Access level or audience",
    icon: "shield-keyhole",
    baseColor: "green",
  },
  {
    id: "other",
    name: "Other",
    description: "Custom context",
    icon: "hash",
    baseColor: "gray",
  },
];

export const tagColors: readonly TagColor[] = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
];

export const tagShades: readonly {
  readonly value: TagShade;
  readonly label: string;
}[] = [
  { value: 300, label: "Lightest" },
  { value: 400, label: "Light" },
  { value: 500, label: "Default" },
  { value: 600, label: "Dark" },
  { value: 700, label: "Darkest" },
];

export function getTagGroupPresentation(
  groupId: TagGroupId,
  groups: readonly TagGroupPresentation[] = tagGroupPresentations,
): TagGroupPresentation {
  return (
    groups.find((group) => group.id === groupId) ??
    groups.find((group) => group.id === "other") ??
    tagGroupPresentations[tagGroupPresentations.length - 1]
  );
}

const groupIcons: Readonly<Record<string, IconSvgElement>> = {
  bell: Notification02Icon,
  tag: Tag01Icon,
  layers: Layers01Icon,
  "shield-keyhole": ShieldKeyIcon,
  hash: HashIcon,
};

export function getTagGroupIcon(group: TagGroupPresentation): IconSvgElement {
  return groupIcons[group.icon] ?? HashIcon;
}
