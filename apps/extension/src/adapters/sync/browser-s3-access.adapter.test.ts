import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrowserS3AccessAdapter,
  createBrowserS3Client,
  s3PermissionOrigin,
  StorageHostPermissionRequiredError,
} from "./browser-s3-access.adapter";
const transport = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", async (original) => {
  const sdk = await original<typeof import("@aws-sdk/client-s3")>();
  return {
    ...sdk,
    S3Client: class extends sdk.S3Client {
      constructor(config: S3ClientConfig) {
        super({ ...config, requestHandler: { handle: transport } });
      }
    },
  };
});
const target = {
  bucket: "personal-vault",
  region: "eu-central-1",
  prefix: "vault/",
};
const origin = "https://personal-vault.s3.eu-central-1.amazonaws.com/*";
afterEach(() => {
  vi.unstubAllGlobals();
  transport.mockReset();
});
describe("browser S3 host permission", () => {
  it.each([
    [target, origin],
    [
      { ...target, region: "us-east-1" },
      "https://personal-vault.s3.us-east-1.amazonaws.com/*",
    ],
    [
      { ...target, region: "cn-north-1" },
      "https://personal-vault.s3.cn-north-1.amazonaws.com.cn/*",
    ],
    [
      { ...target, region: "us-gov-west-1" },
      "https://personal-vault.s3.us-gov-west-1.amazonaws.com/*",
    ],
    [
      { ...target, bucket: "personal.vault" },
      "https://s3.eu-central-1.amazonaws.com/*",
    ],
  ])("matches SDK addressing for %j", (value, expected) => {
    expect(s3PermissionOrigin(value)).toBe(expected);
  });
  it("requests only the configured HTTPS host synchronously and reports denial", async () => {
    const request = vi.fn(async () => false);
    const permissions = { request, contains: vi.fn(async () => false) };
    const access = new BrowserS3AccessAdapter(permissions);
    const result = access.request(target);
    expect(request).toHaveBeenCalledWith({ origins: [origin] });
    expect(permissions.contains).not.toHaveBeenCalled();
    await expect(result).rejects.toBeInstanceOf(
      StorageHostPermissionRequiredError,
    );
  });
  it("rejects wildcard and URL injection before prompting", async () => {
    const permissions = {
      request: vi.fn(async () => true),
      contains: vi.fn(async () => true),
    };
    const access = new BrowserS3AccessAdapter(permissions);
    for (const value of [
      { ...target, bucket: "*" },
      { ...target, bucket: "bucket/other" },
      { ...target, region: "eu-central-1.amazonaws.com.evil.test/" },
      { ...target, bucket: "arn:aws:s3:::other" },
    ])
      await expect(access.request(value)).rejects.toThrow();
    expect(permissions.request).not.toHaveBeenCalled();
  });
  it("blocks a different endpoint even when the browser has broad access", async () => {
    const permissions = {
      request: vi.fn(async () => true),
      contains: vi.fn(async () => true),
    };
    await expect(
      new BrowserS3AccessAdapter(permissions).require(
        target,
        new URL("https://other.s3.eu-central-1.amazonaws.com"),
      ),
    ).rejects.toThrow("does not match");
    expect(permissions.contains).not.toHaveBeenCalled();
  });
  it("checks permission again before an SDK retry", async () => {
    const contains = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    vi.stubGlobal("chrome", { permissions: { contains } });
    transport.mockResolvedValue({
      response: {
        statusCode: 503,
        headers: {},
        body: Readable.from(["<Error><Code>SlowDown</Code></Error>"]),
      },
    });
    const client = createBrowserS3Client(target, {
      accessKeyId: "EXAMPLE",
      secretAccessKey: "test-only",
    });
    await expect(
      client.getObject({ Bucket: target.bucket, Key: "vault/vault.enc" }),
    ).rejects.toBeInstanceOf(StorageHostPermissionRequiredError);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(contains).toHaveBeenCalledTimes(2);
  });
  it("checks permission on real SDK requests and stops after revocation", async () => {
    let allowed = true;
    const contains = vi.fn(async () => allowed);
    vi.stubGlobal("chrome", { permissions: { contains } });
    transport.mockResolvedValue({
      response: {
        statusCode: 200,
        headers: { etag: '"revision-1"' },
        body: Readable.from(["encrypted"]),
      },
    });
    const client = createBrowserS3Client(target, {
      accessKeyId: "EXAMPLE",
      secretAccessKey: "test-only",
    });
    const response = await client.getObject({
      Bucket: target.bucket,
      Key: "vault/vault.enc",
    });
    expect(response.ETag).toBe('"revision-1"');
    expect(await response.Body?.transformToString()).toBe("encrypted");
    expect(contains).toHaveBeenCalledWith({ origins: [origin] });
    expect(transport).toHaveBeenCalledTimes(1);
    const [sent] = transport.mock.calls[0];
    expect(sent.hostname).toBe("personal-vault.s3.eu-central-1.amazonaws.com");
    expect(sent.headers.authorization).toContain("AWS4-HMAC-SHA256");
    allowed = false;
    await expect(
      client.getObject({ Bucket: target.bucket, Key: "vault/vault.enc" }),
    ).rejects.toBeInstanceOf(StorageHostPermissionRequiredError);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
