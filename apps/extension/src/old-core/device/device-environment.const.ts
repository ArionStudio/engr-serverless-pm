/**
 * Device environment constants.
 *
 * @see docs/design/device-environment.md
 */

export const DEVICE_TYPES = ["desktop", "tablet", "mobile"] as const;

export const DEVICE_TYPE_BREAKPOINTS = {
  /** Screen width < 768px */
  mobile: 768,
  /** Screen width < 1024px */
  tablet: 1024,
  /** Screen width >= 1024px */
  desktop: Infinity,
} as const;

/** IP geolocation service URL - 50k free requests/month */
export const GEOLOCATION_API_URL = "https://ipinfo.io/json" as const;
