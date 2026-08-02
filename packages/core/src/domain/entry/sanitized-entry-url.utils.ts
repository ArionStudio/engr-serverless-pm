import {
  InvalidEntryUrlError,
  UnsupportedEntryUrlProtocolError,
} from "../../errors/vault-entry.errors";

const ALLOWED_ENTRY_URL_PROTOCOLS = new Set(["http:", "https:"]);

export function sanitizeEntryUrl(rawUrl: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new InvalidEntryUrlError();
  }

  if (!ALLOWED_ENTRY_URL_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new UnsupportedEntryUrlProtocolError(parsedUrl.protocol);
  }

  const port = parsedUrl.port === "" ? "" : `:${parsedUrl.port}`;

  return `${parsedUrl.protocol}//${parsedUrl.hostname}${port}${parsedUrl.pathname}`;
}
