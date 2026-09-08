import Dexie from "dexie";
import type { EntityTable } from "dexie";
import { globalLibrarySchema, type GlobalLibrary } from "@lfspm/core";
import bundledGlobalLibrary from "@/assets/data/global-library.json";

const DATABASE_NAME = "lfspm-organization-library";
const BUNDLED_LIBRARY_ID = "bundled" as const;

type LibraryRecord = {
  id: typeof BUNDLED_LIBRARY_ID;
  fingerprint: string;
  library: GlobalLibrary;
};

type GlobalLibraryDb = Dexie & {
  libraries: EntityTable<LibraryRecord, "id">;
};

function createGlobalLibraryDb(databaseName: string): GlobalLibraryDb {
  const database = new Dexie(databaseName) as GlobalLibraryDb;
  database.version(1).stores({ libraries: "id" });
  return database;
}

export class IndexedDbGlobalLibraryRepository {
  private readonly database: GlobalLibraryDb;
  private readonly source: unknown;

  constructor(
    databaseName = DATABASE_NAME,
    source: unknown = bundledGlobalLibrary,
  ) {
    this.database = createGlobalLibraryDb(databaseName);
    this.source = source;
  }

  async read(): Promise<GlobalLibrary> {
    const library = globalLibrarySchema.parse(this.source);
    const fingerprint = JSON.stringify(library);
    const stored = await this.database.libraries.get(BUNDLED_LIBRARY_ID);
    if (stored?.fingerprint !== fingerprint) {
      await this.database.libraries.put({
        id: BUNDLED_LIBRARY_ID,
        fingerprint,
        library,
      });
    }
    return structuredClone(library);
  }

  async close(): Promise<void> {
    this.database.close();
  }
}
