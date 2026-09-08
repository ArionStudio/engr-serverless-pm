import {
  Airplane01Icon,
  BankIcon,
  BanknoteIcon,
  Book01Icon,
  Briefcase01Icon,
  Building01Icon,
  Calendar01Icon,
  Car01Icon,
  Chart01Icon,
  CheckListIcon,
  CloudIcon,
  CodeFolderIcon,
  CodeSimpleIcon,
  CreditCardIcon,
  Database01Icon,
  DocumentAttachmentIcon,
  DropletIcon,
  FlashIcon,
  Folder01Icon,
  GameController01Icon,
  Globe02Icon,
  GraduationCapIcon,
  HeartIcon,
  HeartPulseIcon,
  Home01Icon,
  House01Icon,
  Image01Icon,
  Key01Icon,
  Mail01Icon,
  Message01Icon,
  Music01Icon,
  Package01Icon,
  PaintBrush01Icon,
  PlayIcon,
  RepeatIcon,
  ServerIcon,
  Shield01Icon,
  ShoppingBag01Icon,
  SmartPhone01Icon,
  StarIcon,
  User02Icon,
  UserGroupIcon,
  WorkflowCircle01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { ReadFoldersResult } from "@lfspm/core";

export type ManagedFolder = ReadFoldersResult["folders"][number];
export type FolderChoice = Omit<ManagedFolder, "versionVector">;
export type UncategorizedFolder = ReadFoldersResult["uncategorized"];

const folderIconDefinitions: readonly {
  readonly id: string;
  readonly label: string;
  readonly icon: IconSvgElement;
}[] = [
  { id: "folder", label: "Folder", icon: Folder01Icon },
  { id: "airplane", label: "Travel", icon: Airplane01Icon },
  { id: "bank", label: "Bank", icon: BankIcon },
  { id: "banknote", label: "Finance", icon: BanknoteIcon },
  { id: "bolt", label: "Energy", icon: FlashIcon },
  { id: "book", label: "Book", icon: Book01Icon },
  { id: "work", label: "Work", icon: Briefcase01Icon },
  { id: "briefcase", label: "Briefcase", icon: Briefcase01Icon },
  { id: "building", label: "Building", icon: Building01Icon },
  { id: "calendar", label: "Calendar", icon: Calendar01Icon },
  { id: "car", label: "Car", icon: Car01Icon },
  { id: "card", label: "Card", icon: CreditCardIcon },
  { id: "chart", label: "Chart", icon: Chart01Icon },
  { id: "checklist", label: "Checklist", icon: CheckListIcon },
  { id: "cloud", label: "Cloud", icon: CloudIcon },
  { id: "mail", label: "Mail", icon: Mail01Icon },
  { id: "tools", label: "Tools", icon: Wrench01Icon },
  { id: "home", label: "Home", icon: Home01Icon },
  { id: "house", label: "Household", icon: House01Icon },
  { id: "shopping", label: "Shopping", icon: ShoppingBag01Icon },
  { id: "shopping-bag", label: "Shopping", icon: ShoppingBag01Icon },
  { id: "code", label: "Code", icon: CodeSimpleIcon },
  { id: "folder-code", label: "Code folder", icon: CodeFolderIcon },
  { id: "database", label: "Database", icon: Database01Icon },
  { id: "document", label: "Document", icon: DocumentAttachmentIcon },
  { id: "drop", label: "Water", icon: DropletIcon },
  { id: "game", label: "Games", icon: GameController01Icon },
  { id: "globe", label: "Web", icon: Globe02Icon },
  { id: "graduation-cap", label: "Education", icon: GraduationCapIcon },
  { id: "heart", label: "Personal", icon: HeartIcon },
  { id: "heart-pulse", label: "Health", icon: HeartPulseIcon },
  { id: "image", label: "Images", icon: Image01Icon },
  { id: "key", label: "Keys", icon: Key01Icon },
  { id: "message", label: "Messages", icon: Message01Icon },
  { id: "music", label: "Music", icon: Music01Icon },
  { id: "package", label: "Packages", icon: Package01Icon },
  { id: "paint", label: "Design", icon: PaintBrush01Icon },
  { id: "phone", label: "Phone", icon: SmartPhone01Icon },
  { id: "play", label: "Media", icon: PlayIcon },
  { id: "repeat", label: "Subscriptions", icon: RepeatIcon },
  { id: "server", label: "Server", icon: ServerIcon },
  { id: "shield", label: "Security", icon: Shield01Icon },
  { id: "star", label: "Favorites", icon: StarIcon },
  { id: "user", label: "Personal", icon: User02Icon },
  { id: "users", label: "People", icon: UserGroupIcon },
  { id: "workflow", label: "Workflow", icon: WorkflowCircle01Icon },
];

const editableFolderIconIds = new Set([
  "folder",
  "briefcase",
  "home",
  "banknote",
  "mail",
  "shopping-bag",
  "code",
  "database",
  "document",
  "cloud",
  "key",
  "heart-pulse",
  "graduation-cap",
  "airplane",
  "play",
  "server",
  "shield",
]);

export const folderIconChoices = folderIconDefinitions.filter(({ id }) =>
  editableFolderIconIds.has(id),
);

export function getFolderIcon(icon: string): IconSvgElement {
  return (
    folderIconDefinitions.find((choice) => choice.id === icon)?.icon ??
    Folder01Icon
  );
}

export type FolderTreeNode<T extends FolderChoice = ManagedFolder> = {
  readonly folder: T;
  readonly depth: number;
};

export function flattenFolderTree<T extends FolderChoice>(
  folders: readonly T[],
): FolderTreeNode<T>[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const children = new Map<string | null, T[]>();
  for (const folder of folders) {
    const parent =
      folder.parentId && ids.has(folder.parentId) ? folder.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), folder]);
  }
  const nodes: FolderTreeNode<T>[] = [];
  const visited = new Set<string>();
  function visit(parentId: string | null, depth: number) {
    for (const folder of children.get(parentId) ?? []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      nodes.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  }
  visit(null, 1);
  for (const folder of folders) {
    if (!visited.has(folder.id)) nodes.push({ folder, depth: 1 });
  }
  return nodes;
}

export function folderDepth(
  folderId: string | null,
  folders: readonly Pick<FolderChoice, "id" | "parentId">[],
): number {
  if (folderId === null) return 0;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visited = new Set<string>();
  let current = byId.get(folderId);
  let depth = 0;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return depth;
}

export function descendantFolderIds(
  folderId: string,
  folders: readonly ManagedFolder[],
): Set<string> {
  const result = new Set<string>();
  const visit = (parentId: string) => {
    for (const folder of folders) {
      if (folder.parentId !== parentId || result.has(folder.id)) continue;
      result.add(folder.id);
      visit(folder.id);
    }
  };
  visit(folderId);
  return result;
}

export function folderSubtreeHeight(
  folderId: string,
  folders: readonly ManagedFolder[],
): number {
  const children = folders.filter((folder) => folder.parentId === folderId);
  if (!children.length) return 1;
  return (
    1 +
    Math.max(
      ...children.map((folder) => folderSubtreeHeight(folder.id, folders)),
    )
  );
}
