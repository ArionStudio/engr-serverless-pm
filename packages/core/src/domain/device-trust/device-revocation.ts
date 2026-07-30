export type DeviceRevocationTransition = {
  readonly revokedDeviceId: string;
  readonly authorizedByDeviceId: string;
  readonly trustGeneration: number;
  readonly vaultKeyGeneration: number;
};
