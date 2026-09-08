export function browserLoginOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function matchesLoginOrigin(entryUrl: string, pageUrl: string): boolean {
  const origin = browserLoginOrigin(pageUrl);
  return origin !== null && browserLoginOrigin(entryUrl) === origin;
}
