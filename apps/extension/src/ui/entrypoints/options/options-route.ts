export type VaultDestination =
  | "entries"
  | "tags"
  | "tools"
  | "devices"
  | "sync"
  | "settings";

export type OptionsRoute = VaultDestination | "add-entry" | "recover-access";

export const OPTIONS_ROUTE_MESSAGE_TYPE = "lfspm:options-route";

const routes: readonly OptionsRoute[] = [
  "entries",
  "tags",
  "add-entry",
  "recover-access",
  "tools",
  "devices",
  "sync",
  "settings",
];

export function readOptionsRoute(hash: string): OptionsRoute {
  const route = hash.replace(/^#/, "");
  return routes.includes(route as OptionsRoute)
    ? (route as OptionsRoute)
    : "entries";
}

export function readOptionsRouteMessage(message: unknown) {
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    message.type !== OPTIONS_ROUTE_MESSAGE_TYPE ||
    !("route" in message) ||
    typeof message.route !== "string"
  )
    return undefined;
  return routes.find((route) => route === message.route);
}

export function destinationForOptionsRoute(
  route: OptionsRoute,
): VaultDestination {
  return route === "add-entry" || route === "recover-access"
    ? "entries"
    : route;
}
