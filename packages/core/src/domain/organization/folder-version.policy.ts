import { z } from "zod";
import {
  InvalidExpectedFolderVersionError,
  VaultFolderChangedError,
} from "../../errors/vault-organization.errors";
import type { VersionVector } from "../versioning/version-vector.type";
import { compareVersionVectors } from "../versioning/version-vector.utils";

const expectedFolderVersionSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
);

export function captureExpectedFolderVersion(value: unknown): VersionVector {
  const result = expectedFolderVersionSchema.safeParse(value);
  if (!result.success) throw new InvalidExpectedFolderVersionError();
  return result.data;
}

export function requireExpectedFolderVersion(
  current: VersionVector,
  expected: VersionVector,
): void {
  if (compareVersionVectors(current, expected) !== "equal") {
    throw new VaultFolderChangedError();
  }
}
