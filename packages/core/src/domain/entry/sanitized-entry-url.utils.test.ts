import { describe, expect, it } from "vitest";
import { UnsupportedEntryUrlProtocolError } from "../../errors/vault-entry.errors";
import { sanitizeEntryUrl } from "./sanitized-entry-url.utils";

describe("sanitizeEntryUrl", () => {
  it("removes query string and hash from entry urls", () => {
    expect(
      sanitizeEntryUrl(
        "https://example.com/login?session=secret&utm_source=test#section",
      ),
    ).toBe("https://example.com/login");
  });

  it("keeps protocol, host, port, and path", () => {
    expect(sanitizeEntryUrl("https://example.com:8443/accounts/login")).toBe(
      "https://example.com:8443/accounts/login",
    );
  });

  it("removes credentials from entry urls", () => {
    expect(
      sanitizeEntryUrl("https://user:password@example.com/accounts/login"),
    ).toBe("https://example.com/accounts/login");
  });

  it("rejects javascript entry urls", () => {
    const action = () => sanitizeEntryUrl("javascript:alert(1)");

    expect(action).toThrow(UnsupportedEntryUrlProtocolError);
    expect(action).toThrow('Unsupported entry URL protocol "javascript:".');
  });

  it("rejects data entry urls", () => {
    const action = () => sanitizeEntryUrl("data:text/html,<script></script>");

    expect(action).toThrow(UnsupportedEntryUrlProtocolError);
    expect(action).toThrow('Unsupported entry URL protocol "data:".');
  });
});
