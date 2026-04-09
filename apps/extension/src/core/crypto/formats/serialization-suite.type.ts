import type {
  BinaryPublicKeyFormat,
  BinaryPrivateKeyFormat,
} from "./key-format.type";

export type SerializationSuiteId = "ser-v1";

/**
 * Defines how device keys are serialized for local persistence:
 * - Public key binary format for storage alongside wrapped private keys
 * - Private key binary format before wrapping with MasterKEK
 *
 * Transport formats (JWK for device registry / cross-device verification)
 * are a separate concern enforced by the type system (DevicePublicKeysJwk).
 */
export type SerializationSuite = Readonly<{
  readonly id: SerializationSuiteId;
  readonly deviceKeys: Readonly<{
    readonly signingPublic: BinaryPublicKeyFormat;
    readonly agreementPublic: BinaryPublicKeyFormat;
    readonly signingPrivate: BinaryPrivateKeyFormat;
    readonly agreementPrivate: BinaryPrivateKeyFormat;
  }>;
}>;
