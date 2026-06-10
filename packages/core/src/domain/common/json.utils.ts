export function areJsonEqual(
  localValue: unknown,
  remoteValue: unknown,
): boolean {
  return JSON.stringify(localValue) === JSON.stringify(remoteValue);
}
