export function sanitizeEntryUrl(rawUrl: string): string {
  const parsedUrl = new URL(rawUrl);
  parsedUrl.username = "";
  parsedUrl.password = "";
  parsedUrl.search = "";
  parsedUrl.hash = "";

  return parsedUrl.toString();
}
