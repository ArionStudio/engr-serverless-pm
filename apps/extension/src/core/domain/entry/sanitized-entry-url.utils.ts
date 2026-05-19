const ALLOWED_ENTRY_URL_PROTOCOLS = new Set(["http:", "https:"]);

export function sanitizeEntryUrl(rawUrl: string): string {
  const parsedUrl = new URL(rawUrl);

  if (!ALLOWED_ENTRY_URL_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error(`Unsupported entry URL protocol "${parsedUrl.protocol}".`);
  }

  const port = parsedUrl.port === "" ? "" : `:${parsedUrl.port}`;

  return `${parsedUrl.protocol}//${parsedUrl.hostname}${port}${parsedUrl.pathname}`;
}
