import { describe, expect, it } from "vitest";
import { globalLibrarySchema } from "./global-library.schema";

const validLibrary = {
  folders: [
    {
      id: "f001",
      name: "Work",
      icon: "briefcase",
      parent: null,
      description: "Professional accounts",
    },
  ],
  tagGroups: [
    {
      id: "topic",
      name: "Topic",
      icon: "tag",
      baseColor: "blue",
      description: "Subject and purpose",
    },
  ],
  tags: [
    {
      id: "t001",
      name: "Development",
      groupId: "topic",
      color: "blue",
      shade: 500,
      description: "Development accounts",
      aliases: ["dev"],
    },
  ],
  templates: [
    {
      id: "developer",
      label: "Developer",
      complexity: "basic",
      folderIds: ["f001"],
      tagIds: ["t001"],
    },
  ],
} as const;

describe("globalLibrarySchema", () => {
  it("accepts a referentially complete bundled organization library", () => {
    expect(globalLibrarySchema.safeParse(validLibrary).success).toBe(true);
  });

  it("rejects a template that references a missing library item", () => {
    expect(
      globalLibrarySchema.safeParse({
        ...validLibrary,
        templates: [
          {
            ...validLibrary.templates[0],
            folderIds: ["missing-folder"],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
