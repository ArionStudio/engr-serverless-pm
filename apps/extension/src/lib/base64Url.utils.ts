/**
 * Base64Url utilities (RFC 4648 §5).
 *
 * Base64url is Base64 with:
 * - '+' replaced by '-'
 * - '/' replaced by '_'
 * - '=' padding typically omitted
 *
 * NOTE ON LARGE DATA:
 * - Encoding creates a string ~33% larger than the input bytes.
 * - For very large ciphertexts (e.g., ~50 MiB), the base64url string can be
 *   ~67 MiB and may use substantially more memory internally.
 * - JavaScript cannot guarantee secure zeroization of intermediate strings.
 *
 * Reference:
 * - https://datatracker.ietf.org/doc/html/rfc4648#section-5
 */

import type { Base64UrlBytes } from "../core/vault/key-slot.type";

/**
 * Base64 alphabet (RFC 4648 §4).
 */
const B64ABC =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Reverse lookup table for Base64 decoding.
 * Maps charCode (0..255) -> 0..63, '=' -> 0, invalid -> -1.
 */
const B64REV: Int16Array = (() => {
  const rev = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64ABC.length; i++) {
    rev[B64ABC.charCodeAt(i)] = i;
  }
  rev["=".charCodeAt(0)] = 0;
  return rev;
})();

/**
 * Encode base64url string from a Uint8Array.
 *
 * - Produces unpadded base64url (no '=' at the end).
 * - Returns branded Base64UrlBytes type.
 *
 * @param bytes - Data to encode
 * @returns Base64url encoded string (branded type)
 */
export function encodeBase64Url(bytes: Uint8Array): Base64UrlBytes {
  const len = bytes.length;
  const end = len - (len % 3);

  const parts: string[] = [];

  for (let i = 0; i < end; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    parts.push(
      B64ABC[(n >>> 18) & 63] +
        B64ABC[(n >>> 12) & 63] +
        B64ABC[(n >>> 6) & 63] +
        B64ABC[n & 63],
    );
  }

  const rem = len - end;
  if (rem === 1) {
    const n = bytes[end] << 16;
    parts.push(B64ABC[(n >>> 18) & 63] + B64ABC[(n >>> 12) & 63]);
  } else if (rem === 2) {
    const n = (bytes[end] << 16) | (bytes[end + 1] << 8);
    parts.push(
      B64ABC[(n >>> 18) & 63] +
        B64ABC[(n >>> 12) & 63] +
        B64ABC[(n >>> 6) & 63],
    );
  }

  return parts
    .join("")
    .replace(/\+/g, "-")
    .replace(/\//g, "_") as Base64UrlBytes;
}

/**
 * Decode base64url string to a Uint8Array.
 *
 * - Accepts branded Base64UrlBytes type.
 * - Accepts base64url with or without '=' padding.
 * - Throws if the input contains invalid characters.
 *
 * @param b64url - Base64url encoded string (branded type)
 * @returns Decoded bytes
 * @throws Error if input is not valid base64/base64url
 */
export function decodeBase64Url(b64url: Base64UrlBytes): BufferSource {
  // Normalize base64url -> base64
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");

  // Base64 length cannot be mod 4 == 1 (unpadded). Reject early.
  if (b64.length % 4 === 1) {
    throw new Error("Invalid base64/base64url length");
  }

  // Add padding to a multiple of 4
  const padLen = (4 - (b64.length % 4)) % 4;
  const s = b64 + (padLen === 0 ? "" : "=".repeat(padLen));

  let pads = 0;
  if (s.endsWith("==")) pads = 2;
  else if (s.endsWith("=")) pads = 1;

  const outLen = (s.length / 4) * 3 - pads;
  const out = new Uint8Array(outLen);

  let outIndex = 0;

  for (let i = 0; i < s.length; i += 4) {
    const c0 = B64REV[s.charCodeAt(i)];
    const c1 = B64REV[s.charCodeAt(i + 1)];
    const c2 = B64REV[s.charCodeAt(i + 2)];
    const c3 = B64REV[s.charCodeAt(i + 3)];

    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      throw new Error("Invalid base64/base64url character");
    }

    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

    if (outIndex < outLen) out[outIndex++] = (n >>> 16) & 255;
    if (outIndex < outLen) out[outIndex++] = (n >>> 8) & 255;
    if (outIndex < outLen) out[outIndex++] = n & 255;
  }

  return out;
}
