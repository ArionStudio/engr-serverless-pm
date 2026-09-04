import { describe, expect, it, vi } from "vitest";
import { WebCryptoIdAdapter } from "./web-crypto-id.adapter";

describe("WebCryptoIdAdapter", () => {
  it("requests a fresh platform UUID for every call", async () => {
    const firstId = "00000000-0000-4000-8000-000000000001";
    const secondId = "00000000-0000-4000-8000-000000000002";
    const randomUUID = vi
      .fn<Crypto["randomUUID"]>()
      .mockReturnValueOnce(firstId)
      .mockReturnValueOnce(secondId);
    const ids = new WebCryptoIdAdapter({ randomUUID });

    await expect(ids.generateId()).resolves.toBe(firstId);
    await expect(ids.generateId()).resolves.toBe(secondId);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("preserves a platform failure", async () => {
    const failure = new Error("UUID unavailable");
    const randomUUID = vi.fn<Crypto["randomUUID"]>(() => {
      throw failure;
    });
    const ids = new WebCryptoIdAdapter({ randomUUID });

    await expect(ids.generateId()).rejects.toBe(failure);
  });
});
