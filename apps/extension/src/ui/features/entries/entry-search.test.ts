import { describe, expect, it } from "vitest";
import {
  entrySearchSuggestions,
  matchesEntrySearch,
  parseEntrySearch,
  quoteEntrySearchValue,
} from "./entry-search";

describe("entry search parsing", () => {
  it("parses field prefixes and preserves source spans for quoted tokens", () => {
    const query = '  @alex #"Shared work" /Personal :example.test pine  ';
    const terms = parseEntrySearch(query);
    expect(
      terms.map(({ kind, value, prefix }) => ({ kind, value, prefix })),
    ).toEqual([
      { kind: "login", value: "alex", prefix: "@" },
      { kind: "tag", value: "Shared work", prefix: "#" },
      { kind: "folder", value: "Personal", prefix: "/" },
      { kind: "website", value: "example.test", prefix: ":" },
      { kind: "any", value: "pine", prefix: undefined },
    ]);
    const raw = [
      "@alex",
      '#"Shared work"',
      "/Personal",
      ":example.test",
      "pine",
    ];
    expect(terms.map(({ start, end }) => query.slice(start, end))).toEqual(raw);
  });

  it("keeps internal delimiters in email addresses and complete URLs literal", () => {
    const tokens = [
      "alex@example.test",
      "https://example.test:8443/account#work",
      "work/personal",
      "label:value",
    ];
    expect(
      parseEntrySearch(tokens.join(" ")).map(({ kind, value }) => ({
        kind,
        value,
      })),
    ).toEqual(tokens.map((value) => ({ kind: "any", value })));
  });

  it("keeps incomplete quotes and empty prefixes usable during typing", () => {
    expect(
      parseEntrySearch('@ # / : ""').map(({ kind, value }) => ({
        kind,
        value,
      })),
    ).toEqual([
      { kind: "login", value: "" },
      { kind: "tag", value: "" },
      { kind: "folder", value: "" },
      { kind: "website", value: "" },
      { kind: "any", value: "" },
    ]);
    const query = '#"Shared work /Personal';
    expect(parseEntrySearch(query)).toEqual([
      {
        kind: "tag",
        prefix: "#",
        value: "Shared work /Personal",
        start: 0,
        end: query.length,
      },
    ]);
    expect(parseEntrySearch("  \t\n")).toEqual([]);
  });

  it.each([
    "Shared work",
    'Team "Blue"',
    String.raw`Team\Archive`,
    "@home",
    "/Personal",
    "#work",
    ":website",
    "",
    "Finance",
  ])("round-trips the literal value %j through quoted insertion", (value) => {
    const quoted = quoteEntrySearchValue(value);
    expect(parseEntrySearch(quoted)).toEqual([
      { kind: "any", value, start: 0, end: quoted.length },
    ]);
    expect(parseEntrySearch(`#${quoted}`)[0]).toMatchObject({
      kind: "tag",
      value,
    });
  });
});

describe("visible entry matching and suggestions", () => {
  const entry = {
    login: "Alex@example.test",
    sanitizedUrl: "https://login.example.test:8443/account",
    tags: ["shared", "mfa"],
    folderId: "work",
    get password(): never {
      throw new Error("Search must not access passwords.");
    },
  };
  const tags = { shared: "Shared work", mfa: "MFA" };
  const folders = { work: { name: "Work accounts" } };

  it.each([
    ["", true],
    ["@ # / :", true],
    ["ALEX account MFA", true],
    ['@alex #"Shared work" #mfa /"Work accounts" :example.test:8443', true],
    ['#"shared work', true],
    ["@mfa", false],
    ["#alex", false],
    ["/example.test", false],
    [":MFA", false],
    ["alex missing", false],
    ["#shared #missing", false],
    ["https://login.example.test:8443/account", true],
  ])(
    "matches %j with AND semantics and no password access",
    (query, matches) => {
      expect(
        matchesEntrySearch(entry, parseEntrySearch(query), tags, folders),
      ).toBe(matches);
    },
  );

  it("uses Uncategorized only for the permanent uncategorized folder", () => {
    const query = parseEntrySearch("/Uncategorized");
    expect(
      matchesEntrySearch(
        {
          login: entry.login,
          sanitizedUrl: entry.sanitizedUrl,
          tags: entry.tags,
          folderId: "uncategorized",
        },
        query,
      ),
    ).toBe(true);
    expect(matchesEntrySearch(entry, query)).toBe(false);
  });

  it("suggests unique visible values and website hostnames with ports", () => {
    const alternate = {
      login: "alex@example.test",
      sanitizedUrl: "https://login.example.test:8443/other",
      tags: [],
      folderId: "uncategorized",
    };
    const malformed = {
      ...alternate,
      login: "Other user",
      sanitizedUrl: "invalid website",
    };
    expect(
      entrySearchSuggestions([entry, alternate, malformed], tags, folders),
    ).toEqual({
      login: ["Alex@example.test", "Other user"],
      website: ["login.example.test:8443", "invalid website"],
      tag: ["Shared work", "MFA"],
      folder: ["Work accounts", "Uncategorized"],
    });
  });
});
