import { describe, expect, it } from "vitest";
import { s3SetupDocuments } from "./s3-setup-documents";

const location = {
  bucket: "my-vault",
  region: "eu-central-1",
  prefix: "private/vault/",
};

describe("S3 setup permission documents", () => {
  it.each(["my-vault", "my.vault"])(
    "restricts object access and listing for %s to the selected prefix",
    (bucket) => {
      const { documents, error } = s3SetupDocuments({ ...location, bucket });
      expect(error).toBeNull();

      const policy = JSON.parse(documents!.policy);
      expect(policy.Statement).toHaveLength(2);
      expect(policy.Statement[0].Resource).toBe(`arn:aws:s3:::${bucket}`);
      expect(policy.Statement[0].Condition.StringLike["s3:prefix"]).toEqual([
        "private/vault/",
        "private/vault/*",
      ]);
      expect(policy.Statement[1].Resource).toBe(
        `arn:aws:s3:::${bucket}/private/vault/*`,
      );
      expect(policy.Statement[1].Action).not.toContain("s3:*");
      expect(JSON.parse(documents!.tls).Statement[0]).toMatchObject({
        Effect: "Deny",
        Condition: { Bool: { "aws:SecureTransport": "false" } },
      });
    },
  );

  it("rejects invalid bucket names and input that could broaden IAM scope", () => {
    for (const prefix of [
      "",
      "*",
      "vault?/*",
      "${aws:username}/",
      "vault",
      "vault//",
      "private//vault/",
      " vault/",
    ]) {
      expect(s3SetupDocuments({ ...location, prefix })).toEqual({
        documents: null,
        error: "prefix",
      });
    }

    for (const bucket of [
      "*",
      "my-vault/*",
      "${aws:username}",
      "my..vault",
      "127.0.0.1",
      "xn--mistyped-vault",
      "sthree-vault",
      "amzn-s3-demo-vault",
      "vault-s3alias",
      "vault--ol-s3",
      "vault.mrap",
      "vault--x-s3",
      "vault--table-s3",
    ]) {
      expect(s3SetupDocuments({ ...location, bucket })).toEqual({
        documents: null,
        error: "bucket",
      });
    }
  });
});
