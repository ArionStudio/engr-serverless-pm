import { describe, expect, it } from "vitest";
import { InvalidBase64UrlError } from "../errors/base64-url.errors";
import type { Base64URLString } from "./base64Url.type";
import { decodeBase64Url, encodeBase64Url } from "./base64Url.utils";

const b64 = (value: string) => value as Base64URLString;

describe("base64url utilities", () => {
  it("round-trips bytes using unpadded base64url", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);

    const encoded = encodeBase64Url(bytes);

    expect(encoded).not.toContain("=");
    expect(decodeBase64Url(encoded)).toEqual(bytes);
  });

  it("accepts valid terminal base64 padding", () => {
    expect(decodeBase64Url(b64("aGk="))).toEqual(
      new TextEncoder().encode("hi"),
    );
  });

  it("rejects padding before the end of the input", () => {
    const action = () => decodeBase64Url(b64("aG=s"));

    expect(action).toThrow(InvalidBase64UrlError);
    expect(action).toThrow("Invalid base64/base64url character");
  });

  it("rejects partial padded input", () => {
    const action = () => decodeBase64Url(b64("ab="));

    expect(action).toThrow(InvalidBase64UrlError);
    expect(action).toThrow("Invalid base64/base64url padding");
  });

  it("rejects impossible unpadded input length", () => {
    const action = () => decodeBase64Url(b64("a"));

    expect(action).toThrow(InvalidBase64UrlError);
    expect(action).toThrow("Invalid base64/base64url length");
  });
});
