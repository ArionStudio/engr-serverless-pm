export function objectGraphContainsString(
  value: unknown,
  substring: string,
): boolean {
  const visited = new Set<object>();

  function visit(current: unknown): boolean {
    if (typeof current === "string") {
      return current.includes(substring);
    }

    if (
      current === null ||
      (typeof current !== "object" && typeof current !== "function")
    ) {
      return false;
    }

    if (visited.has(current)) {
      return false;
    }

    visited.add(current);

    return Reflect.ownKeys(current).some((propertyKey) => {
      if (String(propertyKey).includes(substring)) {
        return true;
      }

      const descriptor = Object.getOwnPropertyDescriptor(current, propertyKey);

      return (
        descriptor !== undefined &&
        "value" in descriptor &&
        visit(descriptor.value)
      );
    });
  }

  return visit(value);
}
