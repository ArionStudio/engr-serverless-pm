# S3 + Cognito for Browser Extension

A CloudFormation template to provision a private S3 bucket and a Cognito Identity Pool for a browser extension to read/write data using temporary AWS credentials. It enforces strict CORS, AES256 encryption, and versioning with lifecycle cleanup.

## Features

- Private S3 bucket with public access blocked
- Default encryption: AES256 (KMS optional)
- Versioning enabled; lifecycle to prune noncurrent versions and abort incomplete uploads
- Strict CORS for extension origins; exposes `ETag` and `x-amz-version-id`
- Cognito Identity Pool (unauth identities) + IAM role with least-privilege S3 access scoped to a prefix

## Parameters

- `BucketName` (String): Unique S3 bucket name
- `ExtensionOrigins` (CommaDelimitedList): CORS origins (e.g., `chrome-extension://id,https://your.site`)
- `UseKMS` (true|false): Use SSE-KMS and enforce on PutObject (default: false)
- `KMSKeyArn` (String): KMS key ARN (required when `UseKMS=true`, default: "")
- `UserPrefix` (String): Object key prefix to scope access (default: `user/`)
- `IdentityPoolName` (String): Cognito Identity Pool name (default: `S3ExtPool`)
- `RoleName` (String): IAM role name (default: `CognitoS3ExtRole`)
- `LifecycleEnabled` (true|false): Enable lifecycle cleanup rules (default: true)
- `NoncurrentVersionExpirationDays` (Number): Days to delete noncurrent versions (default: 30)
- `AbortIncompleteMultipartUploadDays` (Number): Days to abort incomplete uploads (default: 7)

## Outputs

- `BucketNameOut` — S3 bucket name
- `IdentityPoolIdOut` — Cognito Identity Pool ID
- `CognitoRoleArnOut` — IAM role ARN
- `RegionOut` — AWS region
- `PrefixOut` — Enforced S3 key prefix
- `TemplateVersion` — Template version identifier

## Deploy

### AWS CloudShell (Recommended)

1. **Access CloudShell**
   - Go to [AWS Console](https://console.aws.amazon.com)
   - Click the **CloudShell** icon (terminal icon) in the top navigation bar
   - Wait for CloudShell to initialize (takes ~30 seconds)

2. **Upload Template File**
   - In CloudShell, click the **"Actions"** menu → **"Upload file"**
   - Upload `providers/aws/s3-cognito-extension.yaml`
   - Or use: `curl -O <your-template-url>` if hosted online

3. **Deploy Stack**

   Use this base command and customize the parameters for your environment:

   ```bash
   aws cloudformation deploy \
     --region us-east-1 \
     --stack-name <stack-name> \
     --template-file s3-cognito-extension.yaml \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides \
       BucketName=<bucket-name> \
       ExtensionOrigins="<extension-origins>" \
       UseKMS=false \
       KMSKeyArn="" \
       UserPrefix="<prefix>" \
       IdentityPoolName="<pool-name>" \
       RoleName="<role-name>" \
       LifecycleEnabled=true \
       NoncurrentVersionExpirationDays=30 \
       AbortIncompleteMultipartUploadDays=7
   ```

**Parameter Examples:**

| Environment | Stack Name               | Bucket Name              | UserPrefix  | IdentityPoolName | RoleName              |
| ----------- | ------------------------ | ------------------------ | ----------- | ---------------- | --------------------- |
| Production  | `spm-ext-s3-cognito`     | `your-unique-bucket`     | `user/`     | `S3ExtPool`      | `CognitoS3ExtRole`    |
| Development | `spm-ext-s3-cognito-dev` | `your-unique-bucket-dev` | `dev-user/` | `S3ExtPoolDev`   | `CognitoS3ExtRoleDev` |

**Required Values to Replace:**

- `<bucket-name>`: Unique S3 bucket name
- `<extension-origins>`: CORS origins for your extension and website

**How to Get Extension Origins:**

1. **Chrome Extension ID**:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Find your extension and copy the ID (e.g., `chrome-extension://abcdefghijklmnopqrstuvwxyz123456`)
2. **Website Origins** (if applicable):
   - Add your website domain (e.g., `https://yourdomain.com`)
   - For local development, use `http://localhost:3000` (or your dev port)
3. **Combine Origins**:
   - Separate multiple origins with commas
   - Example: `chrome-extension://abcdefghijklmnopqrstuvwxyz123456,https://yourdomain.com,http://localhost:3000`

4. **Monitor Deployment**

```bash
aws cloudformation describe-stacks --stack-name spm-ext-s3-cognito
aws cloudformation describe-stack-events --stack-name spm-ext-s3-cognito
```

5. **Get Outputs**
   ```bash
   aws cloudformation describe-stacks \
     --stack-name spm-ext-s3-cognito \
     --query 'Stacks[0].Outputs'
   ```

### Alternative: Local AWS CLI

If you prefer using your local AWS CLI instead of CloudShell:

1. **Setup AWS CLI** (if not already configured):

   ```bash
   aws configure
   ```

2. **Use the same deployment command** as above, but change the template file path:

   ```bash
   aws cloudformation deploy \
     --region us-east-1 \
     --stack-name <stack-name> \
     --template-file providers/aws/s3-cognito-extension.yaml \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides \
       BucketName=<bucket-name> \
       ExtensionOrigins="<extension-origins>" \
       UseKMS=false \
       KMSKeyArn="" \
       UserPrefix="<prefix>" \
       IdentityPoolName="<pool-name>" \
       RoleName="<role-name>" \
       LifecycleEnabled=true \
       NoncurrentVersionExpirationDays=30 \
       AbortIncompleteMultipartUploadDays=7
   ```

   **Note**: Only difference is the template file path (`providers/aws/s3-cognito-extension.yaml` vs `s3-cognito-extension.yaml`)

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
- Cognito Identity Pool — https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-cognito-identitypool.html
- IAM Managed Policy — https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-managedpolicy.html
