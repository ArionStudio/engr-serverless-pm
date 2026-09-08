import { z } from "zod";
import {
  InvalidExpectedTagVersionError,
  VaultTagChangedError,
} from "../../errors/vault-tag.errors";
import type { VersionVector } from "../versioning/version-vector.type";
import { compareVersionVectors } from "../versioning/version-vector.utils";

const expectedTagVersionSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
);

export function captureExpectedTagVersion(value: unknown): VersionVector {
  const result = expectedTagVersionSchema.safeParse(value);
  if (!result.success) {
    throw new InvalidExpectedTagVersionError();
  }
  return result.data;
}

export function requireExpectedTagVersion(
  current: VersionVector,
  expected: VersionVector,
): void {
  if (compareVersionVectors(current, expected) !== "equal") {
    throw new VaultTagChangedError();
  }
}
