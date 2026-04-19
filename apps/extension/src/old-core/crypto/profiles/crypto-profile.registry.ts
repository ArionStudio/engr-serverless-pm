import type { CryptoProfile, CryptoProfileId } from "./crypto-profile.type";
import { CRYPTO_PROFILE_V1 } from "./crypto-profile.const";

const PROFILES: Record<CryptoProfileId, CryptoProfile> = {
  "profile-v1": CRYPTO_PROFILE_V1,
};

export function resolveCryptoProfile(id: CryptoProfileId): CryptoProfile {
  const profile = PROFILES[id];
  if (!profile) {
    throw new Error(`Unknown CryptoProfileId: ${id}`);
  }
  return profile;
}
