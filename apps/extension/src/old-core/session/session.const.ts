/**
 * Session constants.
 *
 * @see docs/security/security-specification.md Section 10
 */

import type { SessionOptions } from "./session.type";

/**
 * Default session options.
 * 5-minute auto-lock as per security specification.
 */
export const DEFAULT_SESSION_OPTIONS: SessionOptions = {
  autoLockTimeoutMinutes: 5,
  lockOnIdle: true,
  lockOnPopupClose: false,
} as const;
