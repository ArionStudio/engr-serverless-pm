import type { PublicKeyFormat } from "../../crypto/domain/key-format.type";

/**
 * Base64url-encoded bytes without padding.
 *
 * Used for binary values serialized into persisted JSON structures.
 */
declare const Base64UrlBytesBrand: unique symbol;

export type Base64UrlBytes = string & {
  readonly [Base64UrlBytesBrand]: true;
};

/**
 * Public key material carried inside a device key slot.
 *
 * The bytes are interpreted according to the provided serialization format.
 */
export type SlotPublicKey = Readonly<{
  readonly format: PublicKeyFormat;
  readonly data: Base64UrlBytes;
}>;

/**
 * Wrapped VaultKey for one authorized device.
 */
export interface DeviceKeySlot {
  readonly type: "device";
  readonly deviceId: string;
  readonly epk: SlotPublicKey;
  readonly apu: Base64UrlBytes;
  readonly apv: Base64UrlBytes;
  readonly ciphertext: Base64UrlBytes;
}

/**
 * Wrapped VaultKey for recovery or new-device enrollment using the recovery secret.
 */
export interface SecretKeySlot {
  readonly type: "secret-key";
  readonly deviceId: "secret_key";
  readonly ciphertext: Base64UrlBytes;
}

export type KeySlot = DeviceKeySlot | SecretKeySlot;
