import { S3Client } from "@aws-sdk/client-s3";
import {
  createAwsS3Client,
  decodeTargetConfig,
} from "./aws-s3-sync-provider.adapter";
import type { S3SyncClientFactory } from "./aws-s3-sync-provider.adapter";

export class StorageHostPermissionRequiredError extends Error {
  override readonly name = "StorageHostPermissionRequiredError";
  constructor() {
    super("Browser permission for S3 storage is required.");
  }
}

// Resolve with the same SDK defaults used for requests, including path-style
// addressing for dotted bucket names. No credentials or network calls involved.
const endpointProvider = new S3Client({ region: "us-east-1" }).config
  .endpointProvider;
export function s3PermissionOrigin(value: unknown): string {
  const target = decodeTargetConfig(value);
  const { url } = endpointProvider({
    Region: target.region,
    Bucket: target.bucket,
    ForcePathStyle: false,
    UseFIPS: false,
    UseDualStack: false,
    Accelerate: false,
    UseGlobalEndpoint: false,
  });
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname.endsWith(".amazonaws.com") ||
      url.hostname.endsWith(".amazonaws.com.cn")
    )
  ) {
    throw new Error("Unsupported S3 endpoint.");
  }
  return `${url.origin}/*`;
}

type PermissionApi = Pick<typeof chrome.permissions, "request" | "contains">;
export class BrowserS3AccessAdapter {
  private readonly permissions: PermissionApi;
  constructor(permissions: PermissionApi = chrome.permissions) {
    this.permissions = permissions;
  }

  // Must be called directly in the click handler, before the first await.
  async request(target: unknown): Promise<void> {
    const origins = [s3PermissionOrigin(target)];
    if (!(await this.permissions.request({ origins }))) {
      throw new StorageHostPermissionRequiredError();
    }
  }
  contains(target: unknown): Promise<boolean> {
    return this.permissions.contains({ origins: [s3PermissionOrigin(target)] });
  }
  async require(target: unknown, url: URL): Promise<void> {
    if (`${url.origin}/*` !== s3PermissionOrigin(target)) {
      throw new Error("S3 request does not match the configured storage host.");
    }
    if (!(await this.contains(target)))
      throw new StorageHostPermissionRequiredError();
  }
}

export const createBrowserS3Client: S3SyncClientFactory = (
  target,
  credentials,
) => {
  const access = new BrowserS3AccessAdapter();
  return createAwsS3Client(target, credentials, (url) =>
    access.require(target, url),
  );
};
