import type { VisiblePasswordEntryFields } from "@lfspm/core";
import { getTagGroupPresentation } from "@/ui/features/tags";
export const demoEntries: VisiblePasswordEntryFields[] = [
  {
    id: "demo-1",
    login: "adrian@example.test",
    sanitizedUrl: "https://mail.example.test",
    tags: ["tag-personal"],
    folderId: "uncategorized",
    hasPassword: true,
  },
  {
    id: "demo-2",
    login: "travel@example.test",
    sanitizedUrl: "https://travel.example.test",
    tags: ["tag-travel"],
    folderId: "uncategorized",
    hasPassword: true,
  },
  {
    id: "demo-3",
    login: "work@example.test",
    sanitizedUrl: "https://work.example.test",
    tags: ["tag-work"],
    folderId: "uncategorized",
    hasPassword: true,
  },
  {
    id: "demo-4",
    login: "<script>inert text</script>@example.test",
    sanitizedUrl: "https://example.test",
    tags: ["tag-long"],
    folderId: "uncategorized",
    hasPassword: true,
  },
  {
    id: "demo-5",
    login: "another@example.test",
    sanitizedUrl: "https://another.example.test",
    tags: [],
    folderId: "uncategorized",
    hasPassword: true,
  },
];
export const demoVaults = [
  { id: "personal", name: "Personal vault", deviceLabel: "This laptop" },
  { id: "work", name: "Work vault", deviceLabel: "This laptop" },
];
export const demoTags = [
  {
    id: "tag-personal",
    label: "Personal",
    group: getTagGroupPresentation("other"),
    color: "purple",
    shade: 500,
  },
  {
    id: "tag-work",
    label: "Work",
    group: getTagGroupPresentation("topic"),
    color: "blue",
    shade: 500,
  },
  {
    id: "tag-travel",
    label: "Travel",
    group: getTagGroupPresentation("topic"),
    color: "pink",
    shade: 500,
  },
] as const;
// Deliberately not a valid BIP39 phrase. Never generated from a real vault.
export const demoWords = Array.from(
  { length: 24 },
  (_, i) => `demo-${String(i + 1).padStart(2, "0")}`,
);

export const demoTagLabels: Readonly<Record<string, string>> = {
  "tag-personal": "Personal",
  "tag-work": "Work",
  "tag-travel": "Travel",
  "tag-long": "Long tag label for reflow review",
};

export const demoTableEntries: VisiblePasswordEntryFields[] = [
  ...demoEntries,
  ...Array.from({ length: 19 }, (_, i) => ({
    id: `demo-table-${i + 6}`,
    login: `example-${i + 6}@example.test`,
    sanitizedUrl: `https://service-${i + 6}.example.test`,
    tags: [["tag-personal", "tag-work", "tag-travel"][i % 3]],
    folderId: "uncategorized",
    hasPassword: true,
  })),
];
