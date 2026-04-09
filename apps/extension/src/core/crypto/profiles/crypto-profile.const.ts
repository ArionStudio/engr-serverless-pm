import type { CryptoProfile } from "./crypto-profile.type";

export const CRYPTO_PROFILE_V1: CryptoProfile = {
  id: "profile-v1",
  algorithmSuiteId: "suite-v1",
  serializationSuiteId: "ser-v1",
} as const;

export const DEFAULT_CRYPTO_PROFILE = CRYPTO_PROFILE_V1;
