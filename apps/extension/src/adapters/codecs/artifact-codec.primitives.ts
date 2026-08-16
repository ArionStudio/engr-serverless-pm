import type {
  SerializedEncrypted,
  SerializedWrapped,
  VersionVector,
} from "@lfspm/core";
import type { Base64URLString } from "@lfspm/core/lib";
import { decodeBase64Url, encodeBase64Url } from "@lfspm/core/lib";

export class StaticArtifactError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("record");
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("record");
  }
  return value as Record<string, unknown>;
}

export function exactRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> {
  const record = asRecord(value);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (
    requiredKeys.some((key) => !Object.hasOwn(record, key)) ||
    Object.keys(record).some((key) => !allowed.has(key))
  ) {
    throw new Error("keys");
  }
  return record;
}

export function nonBlankString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("string");
  }
  return value;
}

export function finiteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("number");
  }
  return value;
}

export function decodeJsonValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return finiteNumber(value);
  }
  if (Array.isArray(value)) {
    return value.map(decodeJsonValue);
  }
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, nested]) => [
      key,
      decodeJsonValue(nested),
    ]),
  );
}

export function safeInteger(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error("integer");
  }
  return value as number;
}

export function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error("boolean");
  }
  return value;
}

export function stringArray(value: unknown, unique = false): string[] {
  if (!Array.isArray(value)) {
    throw new Error("array");
  }
  const result = value.map(nonBlankString);
  if (unique && new Set(result).size !== result.length) {
    throw new Error("duplicate");
  }
  return result;
}

export function decodeVersionVector(value: unknown): VersionVector {
  const record = asRecord(value);
  const entries = Object.entries(record).map(
    ([deviceId, counter]) =>
      [nonBlankString(deviceId), safeInteger(counter)] as const,
  );
  if (new Set(entries.map(([deviceId]) => deviceId)).size !== entries.length) {
    throw new Error("duplicate");
  }
  return Object.fromEntries(entries);
}

export function encodeVersionVector(
  value: VersionVector,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function decodeCanonicalBytes<T extends ArrayBuffer>(
  value: unknown,
  expectedLength?: number,
): T {
  if (typeof value !== "string" || value.includes("=")) {
    throw new Error("base64url");
  }
  const decoded = decodeBase64Url(value as Base64URLString);
  if (
    encodeBase64Url(decoded) !== value ||
    (expectedLength !== undefined && decoded.byteLength !== expectedLength)
  ) {
    decoded.fill(0);
    throw new Error("base64url");
  }
  const result = decoded.buffer.slice(
    decoded.byteOffset,
    decoded.byteOffset + decoded.byteLength,
  ) as T;
  decoded.fill(0);
  return result;
}

export function encodeBytes(value: ArrayBuffer): Base64URLString {
  return encodeBase64Url(new Uint8Array(value));
}

export function canonicalDigest(value: unknown): string {
  decodeCanonicalBytes<ArrayBuffer>(value, 32);
  return value as string;
}

export function decodeEncrypted<T>(
  value: unknown,
  nonceLength = 12,
  exactCiphertextLength?: number,
): SerializedEncrypted<T> {
  const record = exactRecord(value, ["ciphertext", "encryptionNonce"]);
  const ciphertext = decodeCanonicalBytes<ArrayBuffer>(
    record.ciphertext,
    exactCiphertextLength,
  );
  if (exactCiphertextLength === undefined && ciphertext.byteLength < 17) {
    throw new Error("ciphertext");
  }
  decodeCanonicalBytes<ArrayBuffer>(record.encryptionNonce, nonceLength);
  return {
    ciphertext: record.ciphertext as Base64URLString,
    encryptionNonce: record.encryptionNonce as Base64URLString,
  };
}

export function encodeEncrypted<T>(value: SerializedEncrypted<T>): unknown {
  return {
    ciphertext: value.ciphertext,
    encryptionNonce: value.encryptionNonce,
  };
}

export function decodeWrapped<T>(value: unknown): SerializedWrapped<T> {
  const record = exactRecord(value, ["wrappedKey", "wrappingNonce"]);
  const wrappedKey = decodeCanonicalBytes<ArrayBuffer>(record.wrappedKey);
  if (wrappedKey.byteLength < 17) {
    throw new Error("wrapped key");
  }
  decodeCanonicalBytes<ArrayBuffer>(record.wrappingNonce, 12);
  return {
    wrappedKey: record.wrappedKey as Base64URLString,
    wrappingNonce: record.wrappingNonce as Base64URLString,
  };
}

export function encodeWrapped<T>(value: SerializedWrapped<T>): unknown {
  return {
    wrappedKey: value.wrappedKey,
    wrappingNonce: value.wrappingNonce,
  };
}

export function decodeSignature(value: unknown): {
  readonly signature: Base64URLString;
} {
  const record = exactRecord(value, ["signature"]);
  decodeCanonicalBytes<ArrayBuffer>(record.signature, 64);
  return { signature: record.signature as Base64URLString };
}

export function encodeSignature(value: {
  readonly signature: Base64URLString;
}): unknown {
  return { signature: value.signature };
}
