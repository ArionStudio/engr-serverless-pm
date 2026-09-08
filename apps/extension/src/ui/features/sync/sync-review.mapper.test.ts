import { describe, expect, it } from "vitest";
import { organizationSyncReview } from "@/gallery/sync-fixture";
import { comparisons } from "./sync-review.mapper";

describe("sync review comparison details", () => {
  it("shows every mutable non-secret organization field when names stay equal", () => {
    const rows = comparisons(organizationSyncReview);

    expect(rows).toMatchObject([
      {
        id: "entry:entry-account",
        local:
          "Login: alex@example.test\nWebsite: https://example.test/sign-in\nFolder: folder-personal\nTags: Focus (tag-focus)\nPassword saved: Yes",
        remote:
          "Login: alex@example.test\nWebsite: https://example.test/sign-in\nFolder: folder-work\nTags: tag-urgent\nPassword saved: No",
        passwordChanged: true,
      },
      {
        id: "tag:tag-focus",
        local: "Name: Focus\nGroup: topic\nColor: blue\nShade: 500",
        remote: "Name: Focus\nGroup: status\nColor: orange\nShade: 700",
      },
      {
        id: "folder:folder-projects",
        local:
          "Name: Projects\nParent: folder-personal\nIcon: folder\nDescription: Personal projects",
        remote:
          "Name: Projects\nParent: folder-work\nIcon: briefcase\nDescription: Client projects",
      },
    ]);

    const visibleText = rows.flatMap(({ local, remote }) => [local, remote]);
    expect(visibleText.every((text) => !/^Password:/m.test(text))).toBe(true);
  });
});
