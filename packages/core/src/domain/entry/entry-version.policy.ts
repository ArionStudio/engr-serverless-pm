import { z } from "zod";
import {
  InvalidExpectedEntryVersionError,
  PasswordEntryChangedError,
} from "../../errors/vault-entry.errors";
import type { VersionVector } from "../versioning/version-vector.type";
import { compareVersionVectors } from "../versioning/version-vector.utils";

const expectedEntryVersionSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
);

export function captureExpectedEntryVersion(value: unknown): VersionVector {
  const result = expectedEntryVersionSchema.safeParse(value);
  if (!result.success) {
    throw new InvalidExpectedEntryVersionError();
  }
  return result.data;
}

export function requireExpectedEntryVersion(
  current: VersionVector,
  expected: VersionVector,
): void {
  if (compareVersionVectors(current, expected) !== "equal") {
    throw new PasswordEntryChangedError();
  }
}
