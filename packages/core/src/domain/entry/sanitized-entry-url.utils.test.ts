import { describe, expect, it } from "vitest";
import { objectGraphContainsString } from "../../__tests__/fixtures/error-inspection";
import {
  InvalidEntryUrlError,
  UnsupportedEntryUrlProtocolError,
} from "../../errors/vault-entry.errors";
import { sanitizeEntryUrl } from "./sanitized-entry-url.utils";

function captureError(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error("Expected action to throw.");
}

describe("sanitizeEntryUrl", () => {
  it("removes credentials, query string, and hash from entry urls", () => {
    expect(
      sanitizeEntryUrl(
        "https://user:password@example.com/login?session=secret&utm_source=test#section",
      ),
    ).toBe("https://example.com/login");
  });

  it("keeps protocol, host, port, and path", () => {
    expect(sanitizeEntryUrl("https://example.com:8443/accounts/login")).toBe(
      "https://example.com:8443/accounts/login",
    );
  });

  it("redacts malformed entry urls from parse errors", () => {
    const credentialSecret = "credential-secret";
    const querySecret = "query-secret";
    const malformedUrl = `https://user:${credentialSecret}@?token=${querySecret}`;

    const error = captureError(() => sanitizeEntryUrl(malformedUrl));

    expect(error).toBeInstanceOf(InvalidEntryUrlError);
    expect(objectGraphContainsString(error, credentialSecret)).toBe(false);
    expect(objectGraphContainsString(error, querySecret)).toBe(false);
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

  it("reports only the protocol for unsupported ftp entry urls", () => {
    const credentialSecret = "credential-secret";
    const querySecret = "query-secret";
    const fragmentSecret = "fragment-secret";
    const unsupportedUrl = `ftp://user:${credentialSecret}@example.com/path?token=${querySecret}#${fragmentSecret}`;

    const error = captureError(() => sanitizeEntryUrl(unsupportedUrl));

    expect(error).toBeInstanceOf(UnsupportedEntryUrlProtocolError);
    expect(error).toHaveProperty(
      "message",
      'Unsupported entry URL protocol "ftp:".',
    );
    expect(objectGraphContainsString(error, credentialSecret)).toBe(false);
    expect(objectGraphContainsString(error, querySecret)).toBe(false);
    expect(objectGraphContainsString(error, fragmentSecret)).toBe(false);
  });
});
