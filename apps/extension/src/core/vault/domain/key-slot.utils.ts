import type { Base64UrlBytes } from "./key-slot.type";

export function asBase64UrlBytes(value: string): Base64UrlBytes {
  return value as Base64UrlBytes;
}
