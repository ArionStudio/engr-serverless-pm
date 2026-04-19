import type { Base64UrlBytes } from "./key-slot.type";

/**
 * Signed vault envelope metadata.
 *
 * The signature is computed over the canonicalized unsigned envelope.
 */
export interface VaultEnvelope {
  readonly vaultId: Base64UrlBytes;
  readonly signerDeviceId: string;
  readonly revision: number;
  readonly timestamp: number;
  readonly signature: Base64UrlBytes;
}

export type UnsignedVaultEnvelope = Omit<VaultEnvelope, "signature">;
