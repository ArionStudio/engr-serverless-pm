import type { DevicePublicSignKey } from "./brand-keys";
import type { VersionVector } from "../sync/version-vector.type";

export type DeviceProfile = {
  id: string; // random
  name: string; // user given name
  createdAt: number;
  versionVector: VersionVector;
};

export type DeletedDeviceProfile = {
  id: string;
  versionVector: VersionVector;
  deletedAt: number;
};

export type TrustedDevice = {
  id: string; // random
  publicKeys: {
    signingKey: DevicePublicSignKey;
  };
};
