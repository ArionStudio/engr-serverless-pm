function toCanonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toCanonicalJsonValue);
  }

  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([currentKey], [nextKey]) => {
          if (currentKey < nextKey) {
            return -1;
          }

          if (currentKey > nextKey) {
            return 1;
          }

          return 0;
        })
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
