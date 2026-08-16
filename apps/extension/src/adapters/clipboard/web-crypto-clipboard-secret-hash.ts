import type { ClipboardSecretHashPort } from "@lfspm/core";

export class WebCryptoClipboardSecretHash implements ClipboardSecretHashPort {
  private readonly subtleCrypto: SubtleCrypto;

  constructor(subtleCrypto: SubtleCrypto = crypto.subtle) {
    this.subtleCrypto = subtleCrypto;
  }

  async hashSecretValue(value: string): Promise<string> {
    const digest = await this.subtleCrypto.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );

    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  async compareSecretValueHash(left: string, right: string): Promise<boolean> {
    const comparisonLength = Math.max(left.length, right.length);
    let difference = left.length ^ right.length;

    for (let index = 0; index < comparisonLength; index += 1) {
      difference |=
        (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
    }

    return difference === 0;
  }
}
