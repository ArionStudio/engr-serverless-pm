import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/ui/components/primitives/avatar";
import { Skeleton } from "@/ui/components/primitives/skeleton";

export function SiteIcon({
  url,
  source,
  state = "unavailable",
}: {
  url: string;
  source?: string;
  state?: "loaded" | "loading" | "unavailable" | "failed";
}) {
  let initial = "?";
  try {
    const parsed = new URL(url);
    if (
      ["http:", "https:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    )
      initial = parsed.hostname.slice(0, 1).toUpperCase();
  } catch {
    /* Invalid imported URLs use the neutral fallback. */
  }
  // Sources are supplied by the browser capability or bundled gallery assets.
  let approved = false;
  try {
    if (source) {
      const resolved = new URL(source, window.location.href);
      approved =
        resolved.protocol === window.location.protocol &&
        resolved.host === window.location.host;
    }
  } catch {
    /* Reject external or malformed sources. */
  }
  return (
    <span aria-hidden="true">
      {state === "loading" ? (
        <Skeleton className="size-8 rounded-full" />
      ) : (
        <Avatar>
          {state === "loaded" && approved ? (
            <AvatarImage src={source} alt="" className="object-contain" />
          ) : null}
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      )}
    </span>
  );
}
