import { describe, expect, it } from "vitest";
import type { Vault } from "../vault/vault";
import {
  firstPasswordEntry,
  secondPasswordEntry,
  standardVaultTags,
} from "../../__tests__/fixtures/vault-entries";
import { entryMatchesSearchQuery } from "./search-entry-query.utils";

const vault: Vault = {
  entries: [firstPasswordEntry, secondPasswordEntry],
  registeredDevices: [],
  tags: standardVaultTags,
};

describe("entryMatchesSearchQuery", () => {
  it("matches any mode with OR logic across searchable fields", () => {
    expect(
      entryMatchesSearchQuery(firstPasswordEntry, vault, {
        mode: "any",
        value: "work",
      }),
    ).toBe(true);

    expect(
      entryMatchesSearchQuery(firstPasswordEntry, vault, {
        mode: "any",
        value: "service",
      }),
    ).toBe(false);
  });

  it("matches all entries for empty any query", () => {
    expect(
      entryMatchesSearchQuery(firstPasswordEntry, vault, {
        mode: "any",
        value: " ",
      }),
    ).toBe(true);
  });

  it("matches fields mode with AND logic across populated fields", () => {
    expect(
      entryMatchesSearchQuery(secondPasswordEntry, vault, {
        mode: "fields",
        login: "second",
        url: "service",
        tag: [2],
      }),
    ).toBe(true);
  });

  it("requires every requested tag in fields mode", () => {
    expect(
      entryMatchesSearchQuery(secondPasswordEntry, vault, {
        mode: "fields",
        login: "",
        url: "",
        tag: [2, 1],
      }),
    ).toBe(false);
  });
});
