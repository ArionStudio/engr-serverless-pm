# S3 + Cognito for Browser Extension

A CloudFormation template to provision a private S3 bucket and a Cognito Identity Pool for a browser extension to read/write data using temporary AWS credentials. It enforces strict CORS, optional SSE-KMS, versioning with lifecycle cleanup, and optional server access logging.

## Features

- Private S3 bucket with public access blocked
- Default encryption: AES256 or opt-in SSE-KMS
- Versioning enabled; lifecycle to prune noncurrent versions and abort incomplete uploads
- Strict CORS for extension origins; exposes `ETag` and `x-amz-version-id`
- Cognito Identity Pool (unauth identities) + IAM role with least-privilege S3 access scoped to a prefix
- Optional logging bucket (create or use existing)
- DevMode to switch CORS origins for local testing

## Parameters

- `BucketName` (String): Unique S3 bucket name
- `ExtensionOrigins` (CommaDelimitedList): Prod CORS origins (e.g., `chrome-extension://id,https://your.site`)
- `DevMode` (true|false): Use dev CORS origins
- `DevExtensionOrigins` (CommaDelimitedList): Dev CORS origins (e.g., `chrome-extension://dev-id,http://localhost:3000`)
- `EnableAccessLogging` (true|false): Enable S3 server access logging
- `CreateLoggingBucket` (true|false): Create the logging bucket in this stack
- `LoggingBucketName` (String): Logging bucket name (existing or to create)
- `UseKMS` (true|false): Use SSE-KMS and enforce on PutObject
- `KMSKeyArn` (String): KMS key ARN (required when `UseKMS=true`)
- `UserPrefix` (String): Object key prefix to scope access (e.g., `user/`)
- `IdentityPoolName` (String): Cognito Identity Pool name
- `RoleName` (String): IAM role name
- `LifecycleEnabled` (true|false): Enable lifecycle cleanup rules
- `NoncurrentVersionExpirationDays` (Number): Days to delete noncurrent versions
- `AbortIncompleteMultipartUploadDays` (Number): Days to abort incomplete uploads

## Outputs

- `BucketNameOut` — S3 bucket name
- `IdentityPoolIdOut` — Cognito Identity Pool ID
- `CognitoRoleArnOut` — IAM role ARN
- `RegionOut` — AWS region
- `PrefixOut` — Enforced S3 key prefix
- `LoggingBucketOut` — Logging bucket name (only when created in this stack)

## Deploy

Production-like

```bash
aws cloudformation deploy \
  --region <aws-region> \
  --stack-name spm-ext-s3-cognito \
  --template-file providers/aws/s3-cognito-extension.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    BucketName=<your-unique-bucket> \
    ExtensionOrigins="chrome-extension://<prod-ext-id>,https://your.site" \
    DevMode=false \
    EnableAccessLogging=true \
    CreateLoggingBucket=true \
    LoggingBucketName=<your-logging-bucket-name> \
    UseKMS=false \
    UserPrefix="user/" \
    IdentityPoolName="S3ExtPool" \
    RoleName="CognitoS3ExtRole" \
    LifecycleEnabled=true \
    NoncurrentVersionExpirationDays=30 \
    AbortIncompleteMultipartUploadDays=7
```

Dev/testing

```bash
aws cloudformation deploy \
  --region <aws-region> \
  --stack-name spm-ext-s3-cognito-dev \
  --template-file providers/aws/s3-cognito-extension.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    BucketName=<your-unique-bucket-dev> \
    ExtensionOrigins="chrome-extension://<prod-ext-id>,https://your.site" \
    DevMode=true \
    DevExtensionOrigins="chrome-extension://<dev-ext-id>,http://localhost:3000" \
    EnableAccessLogging=false \
    CreateLoggingBucket=false \
    UseKMS=false \
    UserPrefix="dev-user/" \
    IdentityPoolName="S3ExtPoolDev" \
    RoleName="CognitoS3ExtRoleDev" \
    LifecycleEnabled=true
```

## Notes

- TLS-only access is enforced; public access is blocked
- If `UseKMS=true`, ensure CMK policy allows the IAM role to use the key via S3 in this region
- CORS origins must match exactly
- Lifecycle rules apply only to `UserPrefix`

## References

- CloudFormation template anatomy — https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html
- S3 bucket — https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket.html
- S3 CORS — https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html
- S3 lifecycle — https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html
- S3 versioning — https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html
- S3 access logs — https://docs.aws.amazon.com/AmazonS3/latest/userguide/ServerLogs.html
- Cognito Identity Pool — https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-cognito-identitypool.html
- IAM Managed Policy — https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-managedpolicy.html
