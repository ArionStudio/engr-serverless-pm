import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotNotFoundError,
  areVaultSnapshotDescriptorsEqual,
  cloneVaultSnapshotDescriptor,
  cloneVaultSnapshotIdentity,
  toVaultSnapshotDescriptor,
} from "@lfspm/core";
import type {
  DefiniteSyncUploadNonCommit,
  SyncAccess,
  PreparedSyncRemoval,
  PreparedSyncUpload,
  SyncProviderPort,
  SyncSetupInput,
  SyncUploadOutcome,
  CryptoPort,
  VaultSnapshot,
  VaultSnapshotDescriptor,
  VaultSnapshotIdentity,
} from "@lfspm/core";
import {
  WebCryptoAsymmetricKeyValidator,
  WebCryptoAdapter,
  validateVaultSnapshotPublicKeys,
  type AsymmetricKeyValidator,
} from "../crypto";
import { exactRecord as requireExactRecord } from "../codecs/artifact-codec.primitives";
import {
  InvalidRemoteVaultSnapshotRecordError,
  decodeVaultSnapshot,
  decodeVaultSnapshotDescriptor,
  encodeVaultSnapshot,
  encodeVaultSnapshotDescriptor,
} from "../codecs/vault-snapshot.codec";

const JSON_CONTENT_TYPE = "application/json";

type AwsS3TargetConfig = {
  readonly bucket: string;
  readonly region: string;
  readonly prefix: string;
};

type AwsS3CredentialsConfig = {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

type S3ObjectLocation = {
  readonly Bucket: string;
  readonly Key: string;
};

type S3GetObjectInput = S3ObjectLocation & {
  readonly Range?: string;
};

type S3ResponseBody = {
  readonly transformToString: () => Promise<string>;
};

export type S3SyncClient = {
  readonly getObject: (
    input: S3GetObjectInput,
  ) => Promise<{ readonly Body?: S3ResponseBody; readonly ETag?: string }>;
  readonly putObject: (
    input: S3ObjectLocation & {
      readonly Body: string;
      readonly ContentType: typeof JSON_CONTENT_TYPE;
      readonly IfMatch?: string;
      readonly IfNoneMatch?: "*";
    },
  ) => Promise<void>;
  readonly deleteObject: (
    input: S3ObjectLocation & { readonly IfMatch: string },
  ) => Promise<void>;
};

export type S3SyncClientFactory = (
  target: AwsS3TargetConfig,
  credentials: AwsS3CredentialsConfig,
) => S3SyncClient;

type RemoteVaultSnapshotRecord = {
  readonly descriptor: VaultSnapshotDescriptor;
  readonly snapshot: VaultSnapshot;
};

type RemoteVaultSnapshotObject = RemoteVaultSnapshotRecord & {
  readonly etag?: string;
};

const DEFINITIVE_CREDENTIAL_REJECTION_CODES = new Set([
  "InvalidAccessKeyId",
  "InvalidClientTokenId",
  "UnrecognizedClientException",
]);

const NOT_FOUND_ERROR_CODES = new Set(["NoSuchKey", "NotFound"]);
const CONDITIONAL_CONFLICT_ERROR_CODES = new Set([
  "ConditionalRequestConflict",
  "OperationAborted",
  "PreconditionFailed",
]);
const DEFINITIVE_UPLOAD_REJECTION_CODES = new Set([
  "AccessDenied",
  "AuthorizationHeaderMalformed",
  "InvalidAccessKeyId",
  "InvalidBucketName",
  "InvalidRequest",
  "NoSuchBucket",
  "SignatureDoesNotMatch",
]);

export class InvalidSyncProviderResponseError extends Error {
  override readonly name = "InvalidSyncProviderResponseError";

  constructor() {
    super("Sync provider response is malformed.");
  }
}

export class AwsS3SyncProviderAdapter implements SyncProviderPort {
  private readonly createClient: S3SyncClientFactory;
  private readonly asymmetricKeyValidator: AsymmetricKeyValidator;
  private readonly snapshotDigester: Pick<CryptoPort, "digestVaultSnapshot">;

  constructor(
    createClient: S3SyncClientFactory = createAwsS3Client,
    asymmetricKeyValidator: AsymmetricKeyValidator = new WebCryptoAsymmetricKeyValidator(),
    snapshotDigester: Pick<
      CryptoPort,
      "digestVaultSnapshot"
    > = new WebCryptoAdapter(),
  ) {
    this.createClient = createClient;
    this.asymmetricKeyValidator = asymmetricKeyValidator;
    this.snapshotDigester = snapshotDigester;
  }

  async setup(syncConfig: SyncSetupInput): Promise<SyncAccess> {
    return decodeSyncSetupInput(syncConfig);
  }

  async getLatestVaultSnapshotDescriptor(
    syncAccess: SyncAccess,
    vaultId: string,
  ): Promise<VaultSnapshotDescriptor | null> {
    const remote = await this.getRemoteVaultSnapshot(syncAccess, vaultId);
    return remote?.descriptor ?? null;
  }

  async downloadVaultSnapshot(
    syncAccess: SyncAccess,
    descriptor: VaultSnapshotDescriptor,
  ): Promise<VaultSnapshot> {
    const capturedDescriptor = cloneVaultSnapshotDescriptor(descriptor);
    const remote = await this.getRemoteVaultSnapshot(
      syncAccess,
      capturedDescriptor.vaultId,
    );

    if (remote === null) {
      throw new RemoteVaultSnapshotNotFoundError(capturedDescriptor.vaultId);
    }

    if (
      !areVaultSnapshotDescriptorsEqual(remote.descriptor, capturedDescriptor)
    ) {
      throw new RemoteVaultSnapshotChangedError(capturedDescriptor.vaultId);
    }

    return remote.snapshot;
  }

  async prepareVaultSnapshotUpload(
    syncAccess: SyncAccess,
    vaultSnapshot: VaultSnapshot,
    expectedRemoteSnapshotIdentity: VaultSnapshotIdentity | null,
  ): Promise<PreparedSyncUpload> {
    const capturedExpectedRemoteSnapshotIdentity =
      expectedRemoteSnapshotIdentity === null
        ? null
        : cloneVaultSnapshotIdentity(expectedRemoteSnapshotIdentity);
    const vaultId = vaultSnapshot.metadata.id;
    const { client, location } = createOperationContext(
      syncAccess,
      this.createClient,
    );
    const descriptor = toVaultSnapshotDescriptor(vaultId, vaultSnapshot);
    const body = encodeRemoteVaultSnapshotRecord({
      descriptor,
      snapshot: vaultSnapshot,
    });

    if (capturedExpectedRemoteSnapshotIdentity === null) {
      return {
        status: "ready",
        start: () => ({
          outcome: uploadRemoteVaultSnapshot(client, {
            ...location,
            Body: body,
            ContentType: JSON_CONTENT_TYPE,
            IfNoneMatch: "*",
          }),
        }),
      };
    }

    if (capturedExpectedRemoteSnapshotIdentity.descriptor.vaultId !== vaultId) {
      return {
        status: "not_started",
        outcome: remoteSnapshotChangedUploadOutcome(),
      };
    }

    const current = await getRemoteVaultSnapshotObject(
      client,
      location,
      this.asymmetricKeyValidator,
    );

    if (
      current === null ||
      !areVaultSnapshotDescriptorsEqual(
        current.descriptor,
        capturedExpectedRemoteSnapshotIdentity.descriptor,
      ) ||
      (await this.snapshotDigester.digestVaultSnapshot(current.snapshot)) !==
        capturedExpectedRemoteSnapshotIdentity.snapshotDigest
    ) {
      return {
        status: "not_started",
        outcome: remoteSnapshotChangedUploadOutcome(),
      };
    }
    const currentEtag = requireEtag(current);

    return {
      status: "ready",
      start: () => ({
        outcome: uploadRemoteVaultSnapshot(client, {
          ...location,
          Body: body,
          ContentType: JSON_CONTENT_TYPE,
          IfMatch: currentEtag,
        }),
      }),
    };
  }

  async prepareVaultSnapshotRemoval(
    syncAccess: SyncAccess,
    vaultId: string,
    expectedRemoteSnapshotIdentity: VaultSnapshotIdentity | null,
  ): Promise<PreparedSyncRemoval> {
    const capturedExpectedRemoteSnapshotIdentity =
      expectedRemoteSnapshotIdentity === null
        ? null
        : cloneVaultSnapshotIdentity(expectedRemoteSnapshotIdentity);
    const { client, location } = createOperationContext(
      syncAccess,
      this.createClient,
    );
    const current = await getRemoteVaultSnapshotObject(
      client,
      location,
      this.asymmetricKeyValidator,
    );

    if (current === null) {
      return { status: "already_absent" };
    }

    if (
      capturedExpectedRemoteSnapshotIdentity === null ||
      capturedExpectedRemoteSnapshotIdentity.descriptor.vaultId !== vaultId ||
      current.descriptor.vaultId !== vaultId ||
      !areVaultSnapshotDescriptorsEqual(
        current.descriptor,
        capturedExpectedRemoteSnapshotIdentity.descriptor,
      ) ||
      (await this.snapshotDigester.digestVaultSnapshot(current.snapshot)) !==
        capturedExpectedRemoteSnapshotIdentity.snapshotDigest
    ) {
      throw new RemoteVaultSnapshotChangedError(vaultId);
    }
    const currentEtag = requireEtag(current);

    return {
      status: "ready",
      start: () => ({
        outcome: removeRemoteVaultSnapshot(client, vaultId, {
          ...location,
          IfMatch: currentEtag,
        }),
      }),
    };
  }

  async checkVaultAccess(
    syncAccess: SyncAccess,
    vaultId: string,
  ): Promise<"accessible" | "authentication_rejected"> {
    if (vaultId.trim().length === 0) {
      throw new Error("Vault ID is invalid.");
    }

    const { client, location } = createOperationContext(
      syncAccess,
      this.createClient,
    );

    try {
      const response = await client.getObject({
        ...location,
        Range: "bytes=0-0",
      });
      await response.Body?.transformToString();
      return "accessible";
    } catch (error) {
      if (isNotFound(error)) {
        return "accessible";
      }

      if (isDefinitiveCredentialRejection(error)) {
        return "authentication_rejected";
      }

      throw error;
    }
  }

  private async getRemoteVaultSnapshot(
    syncAccess: SyncAccess,
    vaultId: string,
  ): Promise<RemoteVaultSnapshotObject | null> {
    const { client, location } = createOperationContext(
      syncAccess,
      this.createClient,
    );
    const remote = await getRemoteVaultSnapshotObject(
      client,
      location,
      this.asymmetricKeyValidator,
    );

    if (remote !== null && remote.descriptor.vaultId !== vaultId) {
      throw new InvalidRemoteVaultSnapshotRecordError();
    }

    return remote;
  }
}

async function uploadRemoteVaultSnapshot(
  client: S3SyncClient,
  input: Parameters<S3SyncClient["putObject"]>[0],
): Promise<SyncUploadOutcome> {
  try {
    await client.putObject(input);
    return { status: "committed" };
  } catch (error) {
    return classifyRemoteUploadFailure(error, input);
  }
}

async function removeRemoteVaultSnapshot(
  client: S3SyncClient,
  vaultId: string,
  input: Parameters<S3SyncClient["deleteObject"]>[0],
): Promise<void> {
  try {
    await client.deleteObject(input);
  } catch (error) {
    if (isNotFound(error)) {
      return;
    }

    if (isConditionalConflict(error)) {
      throw new RemoteVaultSnapshotChangedError(vaultId);
    }

    throw error;
  }
}

function classifyRemoteUploadFailure(
  error: unknown,
  input: Parameters<S3SyncClient["putObject"]>[0],
): SyncUploadOutcome {
  try {
    if (isDefiniteConditionalUploadNonCommit(error, input)) {
      return remoteSnapshotChangedUploadOutcome();
    }

    if (isDefiniteProviderUploadRejection(error)) {
      return providerRejectedUploadOutcome();
    }
  } catch {
    // Provider rejection objects are untrusted. Inspection failure cannot prove
    // that an initiated write did not commit.
  }

  return { status: "outcome_unknown" };
}

function isDefiniteProviderUploadRejection(error: unknown): boolean {
  return (
    getRequestAttempts(error) === 1 &&
    DEFINITIVE_UPLOAD_REJECTION_CODES.has(getErrorCode(error) ?? "")
  );
}

function isDefiniteConditionalUploadNonCommit(
  error: unknown,
  input: Parameters<S3SyncClient["putObject"]>[0],
): boolean {
  if (getRequestAttempts(error) !== 1) {
    return false;
  }

  const errorCode = getErrorCode(error);
  const status = getHttpStatusCode(error);
  return (
    status === 409 ||
    status === 412 ||
    (status === 404 &&
      input.IfMatch !== undefined &&
      (errorCode === undefined || NOT_FOUND_ERROR_CODES.has(errorCode))) ||
    errorCode === "PreconditionFailed" ||
    errorCode === "ConditionalRequestConflict" ||
    errorCode === "OperationAborted" ||
    (errorCode === "NoSuchKey" && input.IfMatch !== undefined)
  );
}

function remoteSnapshotChangedUploadOutcome(): DefiniteSyncUploadNonCommit {
  return {
    status: "definitely_not_committed",
    reason: "remote_snapshot_changed",
  };
}

function providerRejectedUploadOutcome(): SyncUploadOutcome {
  return {
    status: "definitely_not_committed",
    reason: "provider_rejected",
  };
}

function createAwsS3Client(
  target: AwsS3TargetConfig,
  credentials: AwsS3CredentialsConfig,
): S3SyncClient {
  const client = new S3Client({
    region: target.region,
    credentials,
  });

  return {
    getObject: (input) => client.send(new GetObjectCommand(input)),
    putObject: async (input) => {
      await client.send(new PutObjectCommand(input));
    },
    deleteObject: async (input) => {
      await client.send(new DeleteObjectCommand(input));
    },
  };
}

function createOperationContext(
  syncAccess: SyncAccess,
  createClient: S3SyncClientFactory,
): {
  readonly client: S3SyncClient;
  readonly location: S3ObjectLocation;
} {
  const { target, credentials } = decodeSyncAccess(syncAccess);

  return {
    client: createClient(target, credentials),
    location: {
      Bucket: target.bucket,
      Key: `${target.prefix}vault.enc`,
    },
  };
}

function decodeSyncSetupInput(value: unknown): SyncAccess {
  try {
    const setup = requireExactRecord(value, ["provider", "providerConfig"]);

    if (setup.provider !== "aws-s3-v1") {
      throw new Error("Unsupported sync provider.");
    }

    const providerConfig = requireExactRecord(setup.providerConfig, [
      "credentials",
      "target",
    ]);
    const target = decodeTargetConfig(providerConfig.target);
    const credentials = decodeCredentialsConfig(providerConfig.credentials);

    return {
      target: {
        provider: "aws-s3-v1",
        targetConfig: target,
      },
      credentials: {
        provider: "aws-s3-v1",
        credentialsConfig: credentials,
      },
    };
  } catch {
    throw new InvalidSyncProviderResponseError();
  }
}

function decodeSyncAccess(value: unknown): {
  readonly target: AwsS3TargetConfig;
  readonly credentials: AwsS3CredentialsConfig;
} {
  try {
    const access = requireExactRecord(value, ["credentials", "target"]);
    const targetRecord = requireExactRecord(access.target, [
      "provider",
      "targetConfig",
    ]);
    const credentialsRecord = requireExactRecord(access.credentials, [
      "credentialsConfig",
      "provider",
    ]);

    if (
      targetRecord.provider !== "aws-s3-v1" ||
      credentialsRecord.provider !== "aws-s3-v1"
    ) {
      throw new Error("Unsupported sync provider.");
    }

    return {
      target: decodeTargetConfig(targetRecord.targetConfig),
      credentials: decodeCredentialsConfig(credentialsRecord.credentialsConfig),
    };
  } catch {
    throw new InvalidSyncProviderResponseError();
  }
}

async function getRemoteVaultSnapshotObject(
  client: S3SyncClient,
  location: S3ObjectLocation,
  asymmetricKeyValidator: AsymmetricKeyValidator,
): Promise<RemoteVaultSnapshotObject | null> {
  let response: Awaited<ReturnType<S3SyncClient["getObject"]>>;

  try {
    response = await client.getObject(location);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }

    throw error;
  }

  if (response.Body === undefined) {
    throw new InvalidRemoteVaultSnapshotRecordError();
  }

  const body = await response.Body.transformToString();
  const record = await decodeRemoteVaultSnapshotRecord(
    body,
    asymmetricKeyValidator,
  );
  return {
    ...record,
    ...(response.ETag === undefined ? {} : { etag: response.ETag }),
  };
}

function encodeRemoteVaultSnapshotRecord(
  record: RemoteVaultSnapshotRecord,
): string {
  return JSON.stringify({
    descriptor: encodeVaultSnapshotDescriptor(record.descriptor),
    snapshot: encodeVaultSnapshot(record.snapshot),
  });
}

async function decodeRemoteVaultSnapshotRecord(
  serialized: string,
  asymmetricKeyValidator: AsymmetricKeyValidator,
): Promise<RemoteVaultSnapshotRecord> {
  try {
    const parsed: unknown = JSON.parse(serialized);
    const record = requireExactRecord(parsed, ["descriptor", "snapshot"]);

    const descriptor = decodeVaultSnapshotDescriptor(record.descriptor);
    const snapshot = decodeVaultSnapshot(record.snapshot);
    if (snapshot.metadata.id !== descriptor.vaultId) {
      throw new InvalidRemoteVaultSnapshotRecordError();
    }
    const snapshotDescriptor = toVaultSnapshotDescriptor(
      descriptor.vaultId,
      snapshot,
    );

    if (!areVaultSnapshotDescriptorsEqual(descriptor, snapshotDescriptor)) {
      throw new InvalidRemoteVaultSnapshotRecordError();
    }

    await validateVaultSnapshotPublicKeys(snapshot, asymmetricKeyValidator);

    return { descriptor, snapshot };
  } catch (error) {
    if (error instanceof InvalidRemoteVaultSnapshotRecordError) {
      throw error;
    }

    throw new InvalidRemoteVaultSnapshotRecordError();
  }
}

function requireEtag(remote: RemoteVaultSnapshotObject): string {
  if (remote.etag === undefined || remote.etag.length === 0) {
    throw new InvalidRemoteVaultSnapshotRecordError();
  }

  return remote.etag;
}

function decodeTargetConfig(value: unknown): AwsS3TargetConfig {
  const record = requireExactRecord(value, ["bucket", "prefix", "region"]);
  const bucket = requireTrimmedString(record.bucket, 3, 63);
  const region = requireTrimmedString(record.region, 3, 64);
  const rawPrefix = requireTrimmedString(record.prefix, 0, 512);

  if (
    !/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/.test(bucket) ||
    bucket.includes("..") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(bucket) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(region) ||
    rawPrefix.startsWith("/") ||
    rawPrefix.includes("//") ||
    rawPrefix.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("AWS S3 target configuration is invalid.");
  }

  return {
    bucket,
    region,
    prefix:
      rawPrefix.length === 0 || rawPrefix.endsWith("/")
        ? rawPrefix
        : `${rawPrefix}/`,
  };
}

function decodeCredentialsConfig(value: unknown): AwsS3CredentialsConfig {
  const record = requireExactRecord(value, ["accessKeyId", "secretAccessKey"]);

  return {
    accessKeyId: requireTrimmedString(record.accessKeyId, 1, 128),
    secretAccessKey: requireTrimmedString(record.secretAccessKey, 1, 256),
  };
}

function requireTrimmedString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new Error("AWS S3 configuration field is invalid.");
  }

  const normalized = value.trim();

  if (
    normalized.length < minimumLength ||
    normalized.length > maximumLength ||
    Array.from(normalized).some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    })
  ) {
    throw new Error("AWS S3 configuration field is invalid.");
  }

  return normalized;
}

function isNotFound(error: unknown): boolean {
  return (
    getHttpStatusCode(error) === 404 ||
    NOT_FOUND_ERROR_CODES.has(getErrorCode(error) ?? "")
  );
}

function isConditionalConflict(error: unknown): boolean {
  return (
    getHttpStatusCode(error) === 412 ||
    CONDITIONAL_CONFLICT_ERROR_CODES.has(getErrorCode(error) ?? "")
  );
}

function isDefinitiveCredentialRejection(error: unknown): boolean {
  return DEFINITIVE_CREDENTIAL_REJECTION_CODES.has(getErrorCode(error) ?? "");
}

function getHttpStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const metadata = (error as Record<string, unknown>).$metadata;

  if (typeof metadata !== "object" || metadata === null) {
    return undefined;
  }

  const status = (metadata as Record<string, unknown>).httpStatusCode;
  return typeof status === "number" ? status : undefined;
}

function getRequestAttempts(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const metadata = (error as Record<string, unknown>).$metadata;

  if (typeof metadata !== "object" || metadata === null) {
    return undefined;
  }

  const attempts = (metadata as Record<string, unknown>).attempts;
  return typeof attempts === "number" ? attempts : undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  const code = record.Code ?? record.code ?? record.name;
  return typeof code === "string" ? code : undefined;
}
