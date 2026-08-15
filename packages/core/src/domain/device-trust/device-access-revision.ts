export const INITIAL_DEVICE_ACCESS_REVISION = 1;

export function getNextDeviceAccessRevision(
  currentRevision: number,
): number | null {
  if (
    !Number.isSafeInteger(currentRevision) ||
    currentRevision < INITIAL_DEVICE_ACCESS_REVISION ||
    currentRevision >= Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }

  return currentRevision + 1;
}
