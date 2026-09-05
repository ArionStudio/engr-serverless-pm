import type { VisiblePasswordEntryFields } from "@lfspm/core";
export const demoEntries: VisiblePasswordEntryFields[] = [
  {
    id: "demo-1",
    login: "adrian@example.test",
    sanitizedUrl: "https://mail.example.test",
    tags: [1],
  },
  {
    id: "demo-2",
    login: "travel@example.test",
    sanitizedUrl: "https://travel.example.test",
    tags: [3],
  },
  {
    id: "demo-3",
    login: "work@example.test",
    sanitizedUrl: "https://work.example.test",
    tags: [2],
  },
  {
    id: "demo-4",
    login: "<script>inert text</script>@example.test",
    sanitizedUrl: "https://example.test",
    tags: [4],
  },
  {
    id: "demo-5",
    login: "another@example.test",
    sanitizedUrl: "https://another.example.test",
    tags: [],
  },
];
export const demoVaults = [
  { id: "personal", name: "Personal vault", deviceLabel: "This laptop" },
  { id: "work", name: "Work vault", deviceLabel: "This laptop" },
];
export const demoTags = [
  { id: 1, label: "Personal" },
  { id: 2, label: "Work" },
  { id: 3, label: "Travel" },
];
// Deliberately not a valid BIP39 phrase. Never generated from a real vault.
export const demoWords = Array.from(
  { length: 24 },
  (_, i) => `demo-${String(i + 1).padStart(2, "0")}`,
);

export const demoTagLabels: Readonly<Record<number, string>> = {
  1: "Personal",
  2: "Work",
  3: "Travel",
  4: "Long tag label for reflow review",
};

export const demoTableEntries: VisiblePasswordEntryFields[] = [
  ...demoEntries,
  ...Array.from({ length: 19 }, (_, i) => ({
    id: `demo-table-${i + 6}`,
    login: `example-${i + 6}@example.test`,
    sanitizedUrl: `https://service-${i + 6}.example.test`,
    tags: [(i % 3) + 1],
  })),
];
