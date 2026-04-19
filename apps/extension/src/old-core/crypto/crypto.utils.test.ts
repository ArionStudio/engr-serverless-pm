import { describe, it, expect } from "vitest";
import { APPLICATION_PEPPER, preprocessPassword } from "./crypto.utils";

describe("APPLICATION_PEPPER", () => {
  it("is 32 bytes", () => {
    expect(APPLICATION_PEPPER.length).toBe(32);
  });

  it("is not all zeros", () => {
    expect(APPLICATION_PEPPER.some((b) => b !== 0)).toBe(true);
  });
});

describe("preprocessPassword", () => {
  it("returns 32 bytes (SHA-256 digest)", async () => {
    const result = await preprocessPassword("test-password");
    expect(result.byteLength).toBe(32);
  });

  it("produces different hashes for different passwords", async () => {
    const hash1 = await preprocessPassword("password-alpha");
    const hash2 = await preprocessPassword("password-beta");

    const bytes1 = new Uint8Array(hash1);
    const bytes2 = new Uint8Array(hash2);

    expect(bytes1).not.toEqual(bytes2);
  });

  it("produces different hashes for different peppers", async () => {
    const pepper1 = new Uint8Array(32);
    pepper1.fill(0x01);
    const pepper2 = new Uint8Array(32);
    pepper2.fill(0x02);

    const hash1 = await preprocessPassword("same-password", pepper1);
    const hash2 = await preprocessPassword("same-password", pepper2);

    const bytes1 = new Uint8Array(hash1);
    const bytes2 = new Uint8Array(hash2);

    expect(bytes1).not.toEqual(bytes2);
  });

  it("uses default pepper when omitted", async () => {
    const withDefault = await preprocessPassword("my-password");
    const withExplicit = await preprocessPassword(
      "my-password",
      APPLICATION_PEPPER as Uint8Array,
    );

    expect(new Uint8Array(withDefault)).toEqual(new Uint8Array(withExplicit));
  });

  it("is deterministic for the same input", async () => {
    const hash1 = await preprocessPassword("deterministic-test");
    const hash2 = await preprocessPassword("deterministic-test");

    expect(new Uint8Array(hash1)).toEqual(new Uint8Array(hash2));
  });
});
