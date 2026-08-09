export function areArrayBuffersEqual(left: unknown, right: unknown): boolean {
  if (!(left instanceof ArrayBuffer) || !(right instanceof ArrayBuffer)) {
    return false;
  }

  if (left.byteLength !== right.byteLength) {
    return false;
  }

  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);

  return leftBytes.every((byte, index) => byte === rightBytes[index]);
}
