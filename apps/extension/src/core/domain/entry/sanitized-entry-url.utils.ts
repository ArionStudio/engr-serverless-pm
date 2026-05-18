export function sanitizeEntryUrl(rawUrl: string): string {
  const parsedUrl = new URL(rawUrl);
  parsedUrl.search = "";
  parsedUrl.hash = "";

  return parsedUrl.toString();
}
