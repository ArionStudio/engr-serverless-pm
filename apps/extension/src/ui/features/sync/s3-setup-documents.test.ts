import { describe, expect, it } from "vitest";
import { s3SetupDocuments } from "./s3-setup-documents";

const location = {
  bucket: "my-vault",
  region: "eu-central-1",
  prefix: "private/vault/",
};
const origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

describe("S3 setup permission documents", () => {
  it("restricts object access and listing to the selected prefix and CORS to this extension", () => {
    const documents = s3SetupDocuments(location, origin).documents!;
    const policy = JSON.parse(documents.policy);
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
    expect(JSON.parse(documents.cors)[0].AllowedOrigins).toEqual([origin]);
    expect(JSON.parse(documents.tls).Statement[0]).toMatchObject({
      Effect: "Deny",
      Condition: { Bool: { "aws:SecureTransport": "false" } },
    });
  });

  it("refuses inputs that could broaden IAM scope or inject policy variables", () => {
    for (const prefix of [
      "",
      "*",
      "vault?/*",
      "${aws:username}/",
      "vault",
      "vault//",
      " vault/",
    ])
      expect(s3SetupDocuments({ ...location, prefix }, origin)).toMatchObject({
        documents: null,
        error: "prefix",
      });
    for (const bucket of ["*", "my-vault/*", "${aws:username}"])
      expect(s3SetupDocuments({ ...location, bucket }, origin)).toMatchObject({
        documents: null,
        error: "bucket",
      });
    for (const invalidOrigin of [
      "*",
      "https://example.com",
      `${origin}/path`,
      "moz-extension://*",
    ])
      expect(s3SetupDocuments(location, invalidOrigin)).toEqual({
        documents: null,
        error: "origin",
      });
  });
});

it("keeps Firefox CORS scoped to the browser's exact extension UUID", () => {
  const firefoxOrigin = "moz-extension://2c127fa4-62c7-7e4f-90e5-472b45eecfdc";
  const { documents, error } = s3SetupDocuments(location, firefoxOrigin);
  expect(error).toBeNull();
  expect(JSON.parse(documents!.cors)[0].AllowedOrigins).toEqual([
    firefoxOrigin,
  ]);
});
