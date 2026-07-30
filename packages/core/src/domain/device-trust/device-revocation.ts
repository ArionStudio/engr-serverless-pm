export type DeviceRevocationTransition = {
  readonly type: "revocation";
  readonly revokedDeviceId: string;
  readonly authorizedByDeviceId: string;
  readonly trustGeneration: number;
  readonly vaultKeyGeneration: number;
};
