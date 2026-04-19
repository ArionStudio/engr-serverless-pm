/**
 * Cloud provider configuration types.
 *
 * Supports multiple cloud providers for vault sync.
 * Currently implements AWS S3 with Cognito authentication.
 *
 * @see docs/design/multi-device-setup.md
 */

export type CloudProvider = "aws-s3" | "gcs" | "azure-blob";

interface ProviderConfigBase {
  /** e.g., "us-east-1" */
  readonly region: string;
}

/**
 * AWS S3 provider configuration using Cognito Identity Pool.
 */
export interface S3ProviderConfig extends ProviderConfigBase {
  readonly provider: "aws-s3";
  readonly bucket: string;
  readonly identityPoolId: string;
  /** e.g., "user/" */
  readonly prefix: string;
}

/**
 * Google Cloud Storage provider configuration (future).
 */
export interface GCSProviderConfig extends ProviderConfigBase {
  readonly provider: "gcs";
  readonly bucket: string;
  /** path or inline JSON */
  readonly credentials: string;
  readonly prefix: string;
}

/**
 * Azure Blob Storage provider configuration (future).
 */
export interface AzureBlobProviderConfig extends ProviderConfigBase {
  readonly provider: "azure-blob";
  readonly storageAccount: string;
  readonly container: string;
  /** SAS token or connection string */
  readonly credential: string;
  readonly prefix: string;
}

export type ProviderConfig =
  | S3ProviderConfig
  | GCSProviderConfig
  | AzureBlobProviderConfig;

/**
 * Exported configuration for device transfer.
 * Does NOT contain vault data, only connection config.
 */
export interface ExportedConfig {
  readonly version: 1;
  readonly provider: CloudProvider;
  readonly config: ProviderConfig;
  /** Unix ms */
  readonly exportedAt: number;
  /** Unix ms */
  readonly expiresAt: number | null;
}

/**
 * QR code transfer payload.
 * Contains encrypted provider config with optional PIN protection.
 */
export interface QRTransferPayload {
  readonly version: 1;
  readonly pinProtected: boolean;
  /** base64url */
  readonly encryptedConfig: string;
  /** Unix ms */
  readonly expiresAt: number;
  readonly token: string;
}
