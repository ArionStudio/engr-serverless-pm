import type { DevicePublicSignKey } from "./brand-keys";

export type TrustedDevice = {
  id: string; // random
  publicKeys: {
    signingKey: DevicePublicSignKey;
  };
};
