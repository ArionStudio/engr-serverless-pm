import type { PublicKeyFormat, PrivateKeyFormat } from "./key-format.type";

export type SerializationSuiteId = "ser-v1";

/**
 * Defines how keys are encoded for:
 * - transport (public keys)
 * - persistence (private keys before wrapping)
 *
 * This is suite-like, but kept separate from algorithm selection.
 */
export type SerializationSuite = Readonly<{
  readonly id: SerializationSuiteId;

  readonly deviceKeys: Readonly<{
    readonly signingPublic: PublicKeyFormat;
    readonly agreementPublic: PublicKeyFormat;

    readonly signingPrivate: PrivateKeyFormat;
    readonly agreementPrivate: PrivateKeyFormat;
  }>;
}>;
