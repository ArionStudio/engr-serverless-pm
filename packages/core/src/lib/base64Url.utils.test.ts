import { describe, expect, it } from "vitest";
import { decodeBase64Url, encodeBase64Url } from "./base64Url.utils";

describe("base64url utilities", () => {
  it("round-trips bytes using unpadded base64url", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);

    const encoded = encodeBase64Url(bytes);

    expect(encoded).not.toContain("=");
    expect(decodeBase64Url(encoded)).toEqual(bytes);
  });

  it("accepts valid terminal base64 padding", () => {
    expect(decodeBase64Url("aGk=")).toEqual(new TextEncoder().encode("hi"));
  });

  it("rejects padding before the end of the input", () => {
    expect(() => decodeBase64Url("aG=s")).toThrow(
      "Invalid base64/base64url character",
    );
  });

  it("rejects partial padded input", () => {
    expect(() => decodeBase64Url("ab=")).toThrow(
      "Invalid base64/base64url padding",
    );
  });
});
