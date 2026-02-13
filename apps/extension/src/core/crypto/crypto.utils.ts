/**
 * Crypto utilities — application pepper and password preprocessing.
 *
 * The application pepper is a hardcoded constant mixed into the master
 * password before key derivation. It provides defense-in-depth: even if
 * an attacker obtains the derived salt, they still need the pepper to
 * reproduce the KDF input.
 *
 * @see docs/security/security-specification.md §3.2
 */

import { secureWipe } from "@/lib/secure-wipe.utils";

/**
 * Application pepper — 32-byte hardcoded constant.
 *
 * Defense-in-depth: mixed into the password before KDF derivation.
 * This value MUST NOT change after release; doing so would invalidate
 * all existing vaults.
 */
// prettier-ignore
export const APPLICATION_PEPPER: Readonly<Uint8Array> = new Uint8Array([
  0x9a, 0x4f, 0x2b, 0xd1, 0x07, 0xe3, 0x5c, 0x88,
  0xf6, 0x1d, 0xa0, 0x73, 0xc9, 0x4e, 0x82, 0x3f,
  0xb5, 0x60, 0x17, 0xdc, 0x8b, 0x29, 0xf4, 0x6a,
  0x53, 0x01, 0xce, 0x7f, 0xe8, 0x34, 0x96, 0xab,
]);

/**
 * Preprocess a master password before key derivation.
 *
 * Computes `SHA-256(UTF-8(password) ‖ pepper)`.
 *
 * The intermediate concatenation buffer is wiped after hashing to limit
 * the time sensitive material stays in memory.
 *
 * @param password - Raw master password string
 * @param pepper - Application pepper (defaults to {@link APPLICATION_PEPPER})
 * @returns 32-byte SHA-256 digest suitable for KDF input
 */
export async function preprocessPassword(
  password: string,
  pepper: Uint8Array = APPLICATION_PEPPER as Uint8Array,
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  const combined = new Uint8Array(passwordBytes.length + pepper.length);
  combined.set(passwordBytes, 0);
  combined.set(pepper, passwordBytes.length);

  const digest = await crypto.subtle.digest("SHA-256", combined);

  secureWipe(combined);

  return digest;
}
