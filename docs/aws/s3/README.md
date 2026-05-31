# S3-Only Sync for Browser Extension

A CloudFormation template to provision a private S3 bucket and scoped IAM user
for browser extension sync. It uses direct S3 API access with user-created AWS
keys.

## Features

- Private S3 bucket with public access blocked
- Default encryption: AES256 (SSE-S3)
- Versioning enabled; lifecycle to prune noncurrent versions and abort incomplete uploads
- Strict CORS for extension origins; exposes `ETag` and `x-amz-version-id`
- IAM user for direct S3 API access
- Least-privilege S3 access scoped to the configured object prefix

## Parameters

- `BucketName` (String): Unique S3 bucket name
- `ExtensionOrigins` (CommaDelimitedList): CORS origins (e.g., `chrome-extension://id,https://your.site`)
- `ObjectPrefix` (String): Object key prefix to scope extension access (default: `vault/`)
- `IamUserName` (String): IAM user name for the extension sync credentials (default: `spm-s3-sync-user`)
- `LifecycleEnabled` (true|false): Enable lifecycle cleanup rules (default: true)
- `NoncurrentVersionExpirationDays` (Number): Days to delete noncurrent versions (default: 30)
- `AbortIncompleteMultipartUploadDays` (Number): Days to abort incomplete uploads (default: 7)

## Outputs

- `BucketNameOut` - S3 bucket name
- `RegionOut` - AWS region
- `PrefixOut` - S3 object key prefix scoped by policy
- `IamUserNameOut` - IAM user name
- `TemplateVersion` - Template version identifier

## Credential Model

This setup intentionally uses user-created AWS access keys instead of a
managed Cognito/STS flow. The password manager is local-first: the encrypted
vault and device state live in the browser extension, and the project does not
operate a backend that can issue, refresh, or revoke provider-specific
credentials for the user.

The CloudFormation stack creates only the bucket, IAM user, and scoped policy.
It does not create or output an access key. The user creates the access key after
deployment, so AWS reveals the secret access key only during key creation instead
of persisting it in stack outputs.

The extension stores the S3 provider configuration and AWS key pair inside the
encrypted vault payload. They are not persisted as a separate local credential
blob. Unlocking the local vault snapshot decrypts the vault data and makes the
sync credentials available to the unlocked session; while the vault is locked,
S3 sync cannot authenticate.

Adding temporary credentials would make onboarding more complex without giving
the extension a stronger trust boundary: temporary keys still have to live in
the same runtime trust boundary as the unlocked vault state, and refresh
requires another long-lived authority. For this local-first architecture, the
simpler model is to store one scoped key pair inside the vault, document its
exposure clearly, and let the user rotate or revoke it in their own AWS account.

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

The stack outputs provide:

- bucket name
- region
- object prefix
- IAM user name

## Create Access Key

Create an access key for the IAM user after the stack is deployed:

```bash
aws iam create-access-key \
  --user-name <iam-user-name>
```

The command returns `AccessKeyId` and `SecretAccessKey`. AWS shows the secret
access key only at creation time. Store both values in the extension's vault
sync settings so they are encrypted as part of the vault payload. Do not commit
them to the repository or store them in CloudFormation outputs.

The extension sync setup needs:

- bucket name
- region
- object prefix
- access key id
- secret access key

## Rotation and Revocation

Rotate the sync key if it was exposed, copied into an unsafe location, or should
no longer be trusted:

1. Create a new access key for `IamUserName` in IAM.
2. Unlock the vault on one trusted device and replace the key id and secret
   access key in the vault's sync settings.
3. Sync/upload the updated encrypted vault while the old key still works.
4. Let each trusted device unlock and sync so it receives the new key from the
   vault.
5. Confirm sync works with the new key on trusted devices.
6. Delete or deactivate the old IAM access key.

Keep this order. Deleting or deactivating the old key before every trusted
device has synced the replacement key will break sync for devices that still
only have the old key inside their local vault copy.

To revoke cloud sync completely, delete or deactivate the IAM access key, delete
the IAM user, or delete the CloudFormation stack. Device revocation inside the
vault still requires vault-key rotation and re-slotting trusted devices; S3 key
revocation only removes that key pair's storage access.

## Notes

- TLS-only access is enforced.
- Public S3 access is blocked.
- CORS origins must match exactly.
- Lifecycle rules apply only to `ObjectPrefix`.
- The IAM policy allows list/read/write/delete only within the configured prefix.
- The configured prefix is intended for one user's vault storage. Devices that unlock the same synced vault receive the same S3 permissions under that prefix.
- The template does not create access keys or store secret keys in CloudFormation outputs.
- AWS reveals the secret access key only when the user creates the key. Treat it as sensitive and rotate it if exposed.

## References

- CloudFormation template anatomy - https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html
- S3 bucket - https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket.html
- S3 CORS - https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html
- S3 lifecycle - https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html
- S3 versioning - https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html
- IAM user - https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-user.html
- IAM access keys - https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html
