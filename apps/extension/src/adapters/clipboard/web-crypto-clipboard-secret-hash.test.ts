import { describe, expect, it } from "vitest";
import { WebCryptoClipboardSecretHash } from "./web-crypto-clipboard-secret-hash";

describe("WebCryptoClipboardSecretHash", () => {
  it("uses the same canonical digest across independent extension contexts", async () => {
    const copyContextHash = new WebCryptoClipboardSecretHash();
    const alarmContextHash = new WebCryptoClipboardSecretHash();
    const copiedValueHash = await copyContextHash.hashSecretValue("password");

    expect(copiedValueHash).toBe(
      "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    );
    await expect(
      alarmContextHash.compareSecretValueHash(
        await alarmContextHash.hashSecretValue("password"),
        copiedValueHash,
      ),
    ).resolves.toBe(true);
    await expect(
      alarmContextHash.compareSecretValueHash(
        await alarmContextHash.hashSecretValue("different-password"),
        copiedValueHash,
      ),
    ).resolves.toBe(false);
  });
});
