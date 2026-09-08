import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { IndexedDbGlobalLibraryRepository } from "./indexeddb-global-library.repository";

const databases: string[] = [];

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map((name) => indexedDB.deleteDatabase(name)),
  );
});

describe("IndexedDbGlobalLibraryRepository", () => {
  it("seeds and returns the complete bundled organization library locally", async () => {
    const databaseName = `organization-library-${crypto.randomUUID()}`;
    databases.push(databaseName);
    const repository = new IndexedDbGlobalLibraryRepository(databaseName);

    const library = await repository.read();

    expect(library.folders.length).toBeGreaterThanOrEqual(100);
    expect(library.tags.length).toBeGreaterThanOrEqual(100);
    expect(library.tagGroups.map(({ id }) => id)).toEqual([
      "status",
      "topic",
      "environment",
      "access",
      "other",
    ]);
    expect(library.templates.map(({ id }) => id)).toEqual([
      "archetype_standard_v1",
      "archetype_developer_v1",
      "archetype_family_v1",
    ]);
    repository.close();
  });
});
