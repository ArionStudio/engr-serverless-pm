function toCanonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toCanonicalJsonValue);
  }

  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([currentKey], [nextKey]) => currentKey.localeCompare(nextKey))
        .map(([key, nestedValue]) => [key, toCanonicalJsonValue(nestedValue)]),
    );
  }

  return value;
}

export function areJsonEqual(
  localValue: unknown,
  remoteValue: unknown,
): boolean {
  return (
    JSON.stringify(toCanonicalJsonValue(localValue)) ===
    JSON.stringify(toCanonicalJsonValue(remoteValue))
  );
}
