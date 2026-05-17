import type { DevicePublicSignKey } from "./brand-keys";

export type Device = {
  id: string; // random
  name: string; // user given name
  createdAt: Date;
  publicKeys: {
    signingKey: DevicePublicSignKey;
  };
};
