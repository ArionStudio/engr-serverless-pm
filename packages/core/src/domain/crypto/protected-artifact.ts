import type { RandomBytes } from "./brand-keys";
import type { Base64UrlString } from "../../lib/base64Url.utils";

declare const __protectedPayload: unique symbol;

export type ProtectionKeyFor<What> = ArrayBuffer & {
  readonly [__protectedPayload]?: What;
};

export type DerivedProtectionKeyFor<What> = {
  readonly key: ProtectionKeyFor<What>;
  readonly salt: RandomBytes;
};

export type Wrapped<What> = {
  readonly wrappedKey: ArrayBuffer;
  readonly wrappingNonce: ArrayBuffer;
  readonly [__protectedPayload]?: What;
};

export type Encrypted<What> = {
  readonly ciphertext: ArrayBuffer;
  readonly encryptionNonce: ArrayBuffer;
  readonly [__protectedPayload]?: What;
};

export type SignatureOf<What> = {
  readonly signature: ArrayBuffer;
  readonly [__protectedPayload]?: What;
};

export type SerializedWrapped<What> = {
  readonly wrappedKey: Base64UrlString;
  readonly wrappingNonce: Base64UrlString;
  readonly [__protectedPayload]?: What;
};

export type SerializedEncrypted<What> = {
  readonly ciphertext: Base64UrlString;
  readonly encryptionNonce: Base64UrlString;
  readonly [__protectedPayload]?: What;
};

export type SerializedSignatureOf<What> = {
  readonly signature: Base64UrlString;
  readonly [__protectedPayload]?: What;
};
