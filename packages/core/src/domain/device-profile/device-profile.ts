import type { VersionVector } from "../versioning/version-vector.type";

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
