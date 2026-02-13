/**
 * Secure memory wipe utility.
 *
 * Overwrites a buffer with zeros to reduce the window during which sensitive
 * data (passwords, keys, intermediate secrets) remains in memory.
 *
 * Limitations (browser JS):
 * - `buffer.fill(0)` is the only reliable mechanism; there is no guarantee
 *   the engine won't optimize it away, but current engines do honor it.
 * - The caller is responsible for nullifying all references to the buffer
 *   after wiping so the GC can reclaim the memory.
 *
 * @see docs/security/security-specification.md §7.2
 */
export function secureWipe(buffer: Uint8Array): void {
  buffer.fill(0);
}
