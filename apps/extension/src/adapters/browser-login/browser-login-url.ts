const localHttpHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function browserLoginPageOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return null;
    if (
      parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && localHttpHosts.has(parsed.hostname))
    )
      return null;
    return parsed.origin;
  } catch {
    return null;
  }
}
