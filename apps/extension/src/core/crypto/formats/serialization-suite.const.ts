import type { SerializationSuite } from "./serialization-suite.type";

export const SERIALIZATION_SUITE_V1: SerializationSuite = {
  id: "ser-v1",
  deviceKeys: {
    signingPublic: "raw",
    agreementPublic: "spki",
    signingPrivate: "pkcs8",
    agreementPrivate: "pkcs8",
  },
} as const;

export const DEFAULT_SERIALIZATION_SUITE = SERIALIZATION_SUITE_V1;
