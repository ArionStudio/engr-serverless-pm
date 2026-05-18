import type { DevicePublicSignKey } from "./brand-keys";

export type Device = {
  id: string; // random
  name: string; // user given name
  createdAt: Date;
  publicKeys: {
    signingKey: DevicePublicSignKey;
  };
};

export type TrustedDevice = {
  id: string; // random
  publicKeys: {
    signingKey: DevicePublicSignKey;
  };
};
