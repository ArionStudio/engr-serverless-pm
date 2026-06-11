import type { RandomBytes } from "./brand-keys";
import type { Base64URLString } from "../../lib/base64Url.type";

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
  readonly wrappedKey: Base64URLString;
  readonly wrappingNonce: Base64URLString;
  readonly [__protectedPayload]?: What;
};

export type SerializedEncrypted<What> = {
  readonly ciphertext: Base64URLString;
  readonly encryptionNonce: Base64URLString;
  readonly [__protectedPayload]?: What;
};

export type SerializedSignatureOf<What> = {
  readonly signature: Base64URLString;
  readonly [__protectedPayload]?: What;
};
