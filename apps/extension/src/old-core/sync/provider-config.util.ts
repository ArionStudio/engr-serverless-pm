/**
 * Cloud provider configuration utility functions.
 *
 * @see docs/design/multi-device-setup.md
 */

import type { ProviderConfig, S3ProviderConfig } from "./provider-config.type";

/**
 * Type guard for S3 provider config.
 */
export function isS3ProviderConfig(
  config: ProviderConfig,
): config is S3ProviderConfig {
  return config.provider === "aws-s3";
}
