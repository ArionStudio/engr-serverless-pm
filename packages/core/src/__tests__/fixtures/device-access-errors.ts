import { expect } from "vitest";
import { DeviceAccessMaterialChangedError } from "../../errors/vault-device.errors";
import {
  objectGraphContainsReference,
  objectGraphContainsString,
} from "./error-inspection";

export function expectErrorDoesNotContainSecrets(params: {
  readonly error: Error;
  readonly stringSecrets: readonly string[];
  readonly objectSecrets: readonly object[];
}): void {
  for (const stringSecret of params.stringSecrets) {
    expect(objectGraphContainsString(params.error, stringSecret)).toBe(false);
  }

  for (const objectSecret of params.objectSecrets) {
    expect(String(params.error)).not.toContain(String(objectSecret));
    expect(objectGraphContainsReference(params.error, objectSecret)).toBe(
      false,
    );
  }
}

export function expectSecretSafeDeviceAccessMaterialChange(params: {
  readonly error: unknown;
  readonly vaultId: string;
  readonly passwords: readonly string[];
  readonly rawDeviceKeys: readonly ArrayBuffer[];
}): void {
  expect(params.error).toBeInstanceOf(DeviceAccessMaterialChangedError);

  if (!(params.error instanceof Error)) {
    throw new Error("Expected a device access material conflict.");
  }

  expect(params.error.name).toBe("DeviceAccessMaterialChangedError");
  expect(params.error.message).toBe(
    `Device access material for vault "${params.vaultId}" changed before save.`,
  );
  expect(params.error.cause).toBeUndefined();

  expectErrorDoesNotContainSecrets({
    error: params.error,
    stringSecrets: params.passwords,
    objectSecrets: params.rawDeviceKeys,
  });
}
