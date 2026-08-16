/**
 * Produces deterministic SHA-256 digests encoded as lowercase hexadecimal.
 * Independent extension contexts must implement this exact format so the
 * scheduled clearer can authenticate metadata created by a copy operation.
 */
export interface ClipboardSecretHashPort {
  hashSecretValue(value: string): Promise<string>;
  compareSecretValueHash(left: string, right: string): Promise<boolean>;
}
