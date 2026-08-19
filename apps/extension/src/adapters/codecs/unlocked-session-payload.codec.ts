import type { EncryptedUnlockedVaultSessionPayload, Vault } from "@lfspm/core";
import {
  StaticArtifactError,
  decodeEncrypted,
  decodeVersionVector,
  encodeEncrypted,
  encodeVersionVector,
  exactRecord,
  nonBlankString,
} from "./artifact-codec.primitives";
import { decodeVault, encodeVault } from "./vault-snapshot.codec";

export class InvalidUnlockedVaultSessionPayloadRecordError extends StaticArtifactError {
  constructor() {
    super(
      "InvalidUnlockedVaultSessionPayloadRecordError",
      "Unlocked vault session payload record is malformed.",
    );
  }
}

export class InvalidUnlockedVaultSessionPayloadError extends StaticArtifactError {
  constructor() {
    super(
      "InvalidUnlockedVaultSessionPayloadError",
      "Unlocked vault session payload is malformed.",
    );
  }
}

export function decodeEncryptedUnlockedVaultSessionPayload(
  value: unknown,
): EncryptedUnlockedVaultSessionPayload {
  try {
    const record = exactRecord(value, [
      "sessionId",
      "vaultId",
      "sourceSnapshotVersionVector",
      "content",
    ]);
    return {
      sessionId: nonBlankString(record.sessionId),
      vaultId: nonBlankString(record.vaultId),
      sourceSnapshotVersionVector: decodeVersionVector(
        record.sourceSnapshotVersionVector,
      ),
      content: decodeEncrypted(record.content),
    };
  } catch {
    throw new InvalidUnlockedVaultSessionPayloadRecordError();
  }
}

export function encodeEncryptedUnlockedVaultSessionPayload(
  value: EncryptedUnlockedVaultSessionPayload,
): unknown {
  return {
    sessionId: value.sessionId,
    vaultId: value.vaultId,
    sourceSnapshotVersionVector: encodeVersionVector(
      value.sourceSnapshotVersionVector,
    ),
    content: encodeEncrypted(value.content),
  };
}

export function decodeUnlockedVaultSessionPayload(value: unknown): {
  readonly vault: Vault;
} {
  try {
    const record = exactRecord(value, ["vault"]);
    return { vault: decodeVault(record.vault) };
  } catch {
    throw new InvalidUnlockedVaultSessionPayloadError();
  }
}

export function encodeUnlockedVaultSessionPayload(value: {
  readonly vault: Vault;
}): unknown {
  return { vault: encodeVault(value.vault) };
}
