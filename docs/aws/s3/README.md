# S3-Only Sync for Browser Extension

A CloudFormation template to provision a private S3 bucket and scoped IAM user
for browser extension sync. It uses direct S3 API access with user-created AWS
keys.

## Features

- Private S3 bucket with public access blocked
- Default encryption: AES256 (SSE-S3)
- Versioning enabled; lifecycle to prune noncurrent versions and abort incomplete uploads
- Optional browser host access for S3; no per-installation CORS allowlist
- IAM user for direct S3 API access
- Least-privilege S3 access scoped to the configured object prefix

## Parameters

- `BucketName` (String): Unique S3 bucket name
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
It does not create or output an access key. In the IAM access-key wizard,
choose **Application running outside AWS** for this browser extension. Review
AWS's alternatives, acknowledge access-key creation if asked, then choose **Next**.
**Description tag value** is an optional label to identify this device's key
when reviewing or replacing it. For example: `LFSPM sync - My laptop`.
Then choose **Create access key**. The user creates the access key after
deployment, so AWS reveals the secret access key only during key creation instead
of persisting it in stack outputs.

The encrypted vault stores only the non-secret S3 target: bucket, region, and
object prefix. Each device stores its AWS key pair separately as a
device-local encrypted credential record. That ciphertext is bound to the
vault ID, local device ID, provider, and target. Shared snapshots and enrollment
files contain no AWS credentials.

Adding temporary credentials would make onboarding more complex without giving
the extension a stronger trust boundary: temporary keys still have to live in
the same runtime trust boundary as the unlocked vault state, and refresh
requires another long-lived authority. For this local-first architecture, the
user may enter the same scoped key pair on several devices, but every device
encrypts its own copy. The project cannot create or revoke the IAM key on the
user's behalf.

## Deploy

### Extension setup guide

After creating and unlocking the vault, open **Options → Sync**. Unconfigured
sync opens **Set up S3 storage**. Choose **Use template** for CloudFormation or
**AWS Console** to create the resources manually. **I already have storage**
opens the connection form directly; **Back to setup guide** returns to the guide.

Both methods now show one step at a time with a numbered checklist. Confirm the
AWS action to unlock the next step; completed steps stay available for review.
Opening a link or copying text never marks a step complete. These confirmations
record what you checked in AWS, not a CloudFormation API verification.

The template route separates upload, parameters, deployment, stack status,
Outputs and connection. The final step contains the real connection form and an
expandable **Create access keys in AWS** guide. Use **Create stack → With new resources
(standard)**, then upload the existing template file. Do not use resource import.
Leave the optional deployment role blank unless your account requires one; keep
rollback and deployment validations enabled, and acknowledge named IAM resources.

Check **Stack info** after submitting. While the stack is in progress, wait and
refresh; Outputs are unavailable. For failure or rollback, read the failed
resource's **Status reason** in **Events**. Only confirm **CREATE_COMPLETE** after
AWS shows it. If Outputs remains empty after completion and refresh, check that
the uploaded Template contains its Outputs section.

Copy the bucket, region and prefix from Outputs into the guide. They carry into
the final connection step as a storage summary. **Edit storage** returns to the
location step and retains entered keys in memory. Changing the location invalidates
dependent confirmations and any access-test result. Progress survives switching
methods and returning from the direct connection form during
the same mounted Sync page. It resets when leaving the page, reloading or changing
the vault/session. No setup progress or access keys are persisted by this guide.
**Test access** checks reads and shows its result beside the key fields;
**Enable sync** performs the real encrypted upload. Missing required fields show
inline errors. Only the active connection form renders credential inputs.
The storage summary sits above the key fields. The access result uses the same
SyncStatus panel in the extension and gallery; a confirmed read does not claim
that upload permission was checked or sync enabled.

If **Enable sync** finds a newer authenticated copy of this vault at the selected
location, it does not overwrite S3. The screen shows **Existing vault found** and
offers **Use newer vault from S3**. That separate action verifies the same remote
copy again, replaces the older local copy and stores these access keys encrypted
on this device. If the remote object belongs to another vault, changes during
confirmation, changes device trust or cannot be verified, reconnect stays
blocked. Use the same bucket and prefix that this vault used previously.

The template download uses `providers/aws/s3.template.yaml` from the same build.
The guide explains its parameters, IAM acknowledgement, stack outputs, lifecycle
retention and separate access-key creation. Browser storage access is checked
alongside the bucket location, before access-key entry. The location step cannot
advance until this browser has granted access. Existing-storage setup follows
the same order: location, browser access, then access keys.

For manual setup, enter the new bucket name, region and vault prefix. The guide
generates copyable HTTPS-only bucket policy and IAM permission documents
for that location. The IAM document scopes object access and listing to the
chosen prefix. Wildcards and IAM policy variables are rejected in these inputs.
Use the same dedicated prefix on every device. The guide carries the location
into the final connection step; access keys belong only in that form.
The manual route combines access-key instructions and connection in its fourth step.

Keep Block Public Access enabled, disable ACLs, enable versioning and use SSE-S3.
The manual path does not install lifecycle cleanup; retained versions incur
storage costs. It uses the commercial AWS partition, like the supplied template.
Neither path provisions resources from the extension. The user applies the
instructions in their AWS account.

References checked September 6, 2026:

- [AWS CloudFormation console deployment](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-console-create-stack.html)
- [CloudFormation Outputs availability](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html)
- [Creating an S3 bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html)
- [S3 bucket policy examples, including HTTPS enforcement](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html)
- [Creating IAM policies in the console](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_create-console.html)
- [Access-key wizard: description and retrieval](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-key-self-managed.html)
- [Managing IAM access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys_update.html)

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
- `<prefix>`: S3 object prefix the extension may read and write.
- `<iam-user-name>`: IAM user name to create for this sync setup.

## Browser storage access

Enter the bucket and region, choose **Allow storage access**, and approve the
browser's request before continuing to access keys. Already-granted access is
shown explicitly. Changing the location rechecks access; revoking it blocks
progress until it is restored. Test and Enable retain a permission check for
changes made after this step. Each installation grants its own permission. Firefox UUIDs and Chromium
extension IDs do not need to be added to the bucket's CORS settings.

The extension requests the exact HTTPS hostname resolved by the AWS SDK. For a
bucket without dots this is a bucket-specific host, such as
`https://my-vault.s3.eu-central-1.amazonaws.com/*`. Dotted bucket names require
path-style addressing, so the prompt covers the shared regional S3 hostname.
Browser permissions cannot restrict an object prefix. The scoped IAM policy
continues to enforce bucket and prefix access in both cases.

The manifest declares AWS domains as optional eligibility patterns. It does not
grant access to all AWS hosts. Runtime requests ask only for the configured host.
Every SDK request checks permission again, including retries. Unexpected hosts
and HTTP redirects are rejected. Requests originate in trusted extension code;
web pages cannot use the extension as a general fetch proxy.

If access is denied or revoked, local vault data remains intact. Open Sync and
choose **Allow storage access**, then retry or check sync. An upload interrupted
after it started can remain pending until reconciliation confirms its outcome.

### Existing buckets and stacks

No AWS changes are required to use this permission flow with an existing bucket.
Existing CORS rules may stay in place. New templates omit `ExtensionOrigins` and
`CorsConfiguration`. To remove old CORS rules from a CloudFormation-managed
bucket, update its existing stack using the new template; keep bucket, prefix,
IAM user and lifecycle values unchanged and review the change set. Do not create
another bucket. Keep rules needed by older installations or other clients until
those clients have been updated. Do not change the IAM policy or public-access
blocking to resolve a browser permission problem.

This network design is shared across Chromium and Firefox. Complete Firefox
packaging/runtime support remains a separate task. See [browser support](../../browser-support.md).

References checked September 6, 2026:

- [Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome extension network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Firefox host permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions)
- [Editing S3 CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html)
- [S3 authorization still applies with CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html)

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
access key only at creation time. Enter both values in the extension's sync
settings on the device being configured. They are encrypted only in that
device's local storage. Do not commit them to the repository or store them in
CloudFormation outputs.

The extension sync setup needs:

- bucket name
- region
- object prefix
- access key id
- secret access key

## Rotation and Revocation

Rotate the sync key if it was exposed, copied into an unsafe location, or should
no longer be trusted:

1. Create a replacement access key for `IamUserName` in IAM.
2. Enter it on the trusted device that is revoking another device.
3. Let that device upload the vault-key-rotated snapshot.
4. Delete the old IAM access key in AWS.
5. Run provider-revocation verification in the extension. The workflow remains
   pending until AWS rejects the old key.
6. Enter the replacement key once on every surviving device before that
   device's next sync.

The replacement key is never distributed through the vault snapshot. Do not
delete the old key before the rotated snapshot has uploaded, because the
revoking device first verifies that both credentials address the same current
vault namespace. Deactivation alone is insufficient for verification: AWS
reports inactive keys and active keys denied by policy through the same
ambiguous authorization failure, so the extension keeps revocation pending.

Survivor recovery uses the current object only. It validates the complete
signed chronological trust suffix, including any enrollments between
revocations, and does not read or depend on retained S3 object versions. Bucket
versioning remains an operational recovery feature, not a device-revocation
security requirement.

To revoke cloud sync completely, delete or deactivate the IAM access key, delete
the IAM user, or delete the CloudFormation stack. Device revocation inside the
vault still requires vault-key rotation and re-slotting trusted devices; S3 key
revocation only removes that key pair's storage access.

## Notes

- TLS-only access is enforced.
- Public S3 access is blocked.
- Browser storage permission must be granted for the configured S3 hostname.
- Lifecycle rules apply only to `ObjectPrefix`.
- The IAM policy allows list/read/write/delete only within the configured prefix.
- The configured prefix is intended for one user's vault storage. Devices on
  which the user enters the same key receive the same S3 permissions under that
  prefix.
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
