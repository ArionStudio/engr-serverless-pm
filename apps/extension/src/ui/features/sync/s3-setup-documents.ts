import type { SyncLocation } from "./sync.type";

// These are AWS setup documents displayed for the user to apply in their account.
// No credentials are accepted here. Reject IAM wildcard syntax in user input.
export function s3SetupDocuments(location: SyncLocation) {
  const { bucket, prefix } = location;
  // These policy ARNs require a general purpose bucket, not an access-point alias.
  const validBucket =
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) &&
    !bucket.includes("..") &&
    !/^(?:xn--|sthree-|amzn-s3-demo-)/.test(bucket) &&
    !/(?:-s3alias|--ol-s3|\.mrap|--x-s3|--table-s3)$/.test(bucket) &&
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(bucket);
  const validPrefix =
    /^[a-zA-Z0-9][a-zA-Z0-9/_-]*\/$/.test(prefix) &&
    prefix.length <= 128 &&
    !prefix.includes("//");
  if (!validBucket) return { documents: null, error: "bucket" as const };
  if (!validPrefix) return { documents: null, error: "prefix" as const };

  const arn = `arn:aws:s3:::${bucket}`;
  return {
    error: null,
    documents: {
      policy: JSON.stringify(
        {
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "ListConfiguredPrefix",
              Effect: "Allow",
              Action: ["s3:ListBucket", "s3:ListBucketVersions"],
              Resource: arn,
              Condition: {
                StringLike: { "s3:prefix": [prefix, `${prefix}*`] },
              },
            },
            {
              Sid: "ReadWriteConfiguredPrefix",
              Effect: "Allow",
              Action: [
                "s3:GetObject",
                "s3:GetObjectVersion",
                "s3:PutObject",
                "s3:DeleteObject",
              ],
              Resource: `${arn}/${prefix}*`,
            },
          ],
        },
        null,
        2,
      ),
      tls: JSON.stringify(
        {
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "DenyNonTLS",
              Effect: "Deny",
              Principal: "*",
              Action: "s3:*",
              Resource: [arn, `${arn}/*`],
              Condition: { Bool: { "aws:SecureTransport": "false" } },
            },
          ],
        },
        null,
        2,
      ),
    },
  };
}
