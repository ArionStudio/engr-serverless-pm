import { describe, expect, it } from "vitest";
import { s3SetupDocuments } from "./s3-setup-documents";

const location = {
  bucket: "my-vault",
  region: "eu-central-1",
  prefix: "private/vault/",
};

describe("S3 setup permission documents", () => {
  it("restricts object access and listing to the selected prefix", () => {
    const { documents, error } = s3SetupDocuments(location);
    expect(error).toBeNull();

    const policy = JSON.parse(documents!.policy);
    expect(policy.Statement).toHaveLength(2);
    expect(policy.Statement[0].Resource).toBe("arn:aws:s3:::my-vault");
    expect(policy.Statement[0].Condition.StringLike["s3:prefix"]).toEqual([
      "private/vault/",
      "private/vault/*",
    ]);
    expect(policy.Statement[1].Resource).toBe(
      "arn:aws:s3:::my-vault/private/vault/*",
    );
    expect(policy.Statement[1].Action).not.toContain("s3:*");
    expect(JSON.parse(documents!.tls).Statement[0]).toMatchObject({
      Effect: "Deny",
      Condition: { Bool: { "aws:SecureTransport": "false" } },
    });
  });

  it("reports the field that could broaden IAM scope or inject policy variables", () => {
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

    for (const bucket of ["*", "my-vault/*", "${aws:username}"]) {
      expect(s3SetupDocuments({ ...location, bucket })).toEqual({
        documents: null,
        error: "bucket",
      });
    }
  });
});
