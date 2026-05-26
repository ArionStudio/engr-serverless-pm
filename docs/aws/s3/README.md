# S3-Only Sync for Browser Extension

A CloudFormation template to provision a private S3 bucket and scoped IAM access keys for browser extension sync. It uses direct S3 API access with user-provided AWS keys.

## Features

- Private S3 bucket with public access blocked
- Default encryption: AES256 (SSE-S3)
- Versioning enabled; lifecycle to prune noncurrent versions and abort incomplete uploads
- Strict CORS for extension origins; exposes `ETag` and `x-amz-version-id`
- IAM user and access key pair for direct S3 API access
- Least-privilege S3 access scoped to the configured object prefix

## Parameters

- `BucketName` (String): Unique S3 bucket name
- `ExtensionOrigins` (CommaDelimitedList): CORS origins (e.g., `chrome-extension://id,https://your.site`)
- `ObjectPrefix` (String): Object key prefix to scope extension access (default: `vault/`)
- `IamUserName` (String): IAM user name for the extension sync access key (default: `spm-s3-sync-user`)
- `LifecycleEnabled` (true|false): Enable lifecycle cleanup rules (default: true)
- `NoncurrentVersionExpirationDays` (Number): Days to delete noncurrent versions (default: 30)
- `AbortIncompleteMultipartUploadDays` (Number): Days to abort incomplete uploads (default: 7)

## Outputs

- `BucketNameOut` - S3 bucket name
- `RegionOut` - AWS region
- `PrefixOut` - S3 object key prefix scoped by policy
- `IamUserNameOut` - IAM user name
- `AccessKeyIdOut` - AWS access key id for the extension
- `SecretAccessKeyOut` - AWS secret access key for the extension
- `TemplateVersion` - Template version identifier

## Deploy

### AWS CloudShell

1. Open AWS CloudShell from the AWS Console.
2. Upload `providers/aws/s3.template.yaml`.
3. Deploy the stack:

```bash
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name <stack-name> \
  --template-file s3.template.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    BucketName=<bucket-name> \
    ExtensionOrigins="<extension-origins>" \
    ObjectPrefix="<prefix>" \
    IamUserName="<iam-user-name>" \
    LifecycleEnabled=true \
    NoncurrentVersionExpirationDays=30 \
    AbortIncompleteMultipartUploadDays=7
```

### Local AWS CLI

Use the same deployment command with the repository path:

```bash
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name <stack-name> \
  --template-file providers/aws/s3.template.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    BucketName=<bucket-name> \
    ExtensionOrigins="<extension-origins>" \
    ObjectPrefix="<prefix>" \
    IamUserName="<iam-user-name>" \
    LifecycleEnabled=true \
    NoncurrentVersionExpirationDays=30 \
    AbortIncompleteMultipartUploadDays=7
```

## Parameter Examples

| Environment | Stack Name       | Bucket Name              | ObjectPrefix | IamUserName            |
| ----------- | ---------------- | ------------------------ | ------------ | ---------------------- |
| Production  | `spm-ext-s3`     | `your-unique-bucket`     | `vault/`     | `spm-s3-sync-user`     |
| Development | `spm-ext-s3-dev` | `your-unique-bucket-dev` | `dev-vault/` | `spm-s3-sync-user-dev` |

## Required Values

- `<bucket-name>`: Globally unique S3 bucket name.
- `<extension-origins>`: CORS origins for the extension and optional website.
- `<prefix>`: S3 object prefix the extension may read and write.
- `<iam-user-name>`: IAM user name to create for this sync setup.

## Extension Origins

1. Go to `chrome://extensions/`.
2. Enable Developer mode.
3. Copy the extension ID and format it as `chrome-extension://<extension-id>`.
4. Add any website or local development origins if needed.
5. Separate multiple origins with commas.

Example:

```text
chrome-extension://abcdefghijklmnopqrstuvwxyz123456,https://yourdomain.com,http://localhost:3000
```

## Get Outputs

```bash
aws cloudformation describe-stacks \
  --stack-name <stack-name> \
  --query 'Stacks[0].Outputs'
```

The extension sync setup needs:

- bucket name
- region
- object prefix
- access key id
- secret access key

Store the access keys only in the extension's locally encrypted sync configuration. Do not commit them to the repository.

## Notes

- TLS-only access is enforced.
- Public S3 access is blocked.
- CORS origins must match exactly.
- Lifecycle rules apply only to `ObjectPrefix`.
- The IAM policy allows list/read/write/delete only within the configured prefix.
- The secret access key is visible in CloudFormation outputs when the access key is created. Treat it as sensitive and rotate it if exposed.

## References

- CloudFormation template anatomy - https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html
- S3 bucket - https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket.html
- S3 CORS - https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html
- S3 lifecycle - https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html
- S3 versioning - https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html
- IAM user - https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-user.html
- IAM access key - https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-accesskey.html
