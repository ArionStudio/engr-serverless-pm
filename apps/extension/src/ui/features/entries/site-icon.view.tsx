import { useSiteIcons } from "../site-icons/site-icons.context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/ui/components/primitives/avatar";
import { Skeleton } from "@/ui/components/primitives/skeleton";

export function SiteIcon({
  url,
  source,
  state,
}: {
  url: string;
  source?: string;
  state?: "loaded" | "loading" | "unavailable" | "failed";
}) {
  const icons = useSiteIcons();
  const resolvedSource =
    source ?? (state === undefined ? icons.source(url) : undefined);
  const resolvedState = state ?? (resolvedSource ? "loaded" : "unavailable");
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
    if (resolvedSource) {
      const resolved = new URL(resolvedSource, window.location.href);
      approved =
        resolved.protocol === window.location.protocol &&
        resolved.host === window.location.host;
    }
  } catch {
    /* Reject external or malformed sources. */
  }
  return (
    <span aria-hidden="true">
      {resolvedState === "loading" ? (
        <Skeleton className="size-8 rounded-full" />
      ) : (
        <Avatar
          key={
            resolvedState === "loaded" && approved ? resolvedSource : "fallback"
          }
        >
          {resolvedState === "loaded" && approved ? (
            <AvatarImage
              src={resolvedSource}
              alt=""
              className="object-contain"
            />
          ) : null}
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      )}
    </span>
  );
}
