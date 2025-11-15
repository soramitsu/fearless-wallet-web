export const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export const reduceObjectEntries = <T>(
  source: unknown,
  iteratee: (entry: unknown, key: string) => T | null
): Record<string, T> => {
  if (!source || typeof source !== 'object') return {};

  return Object.entries(source as Record<string, unknown>).reduce<Record<string, T>>((acc, [key, value]) => {
    const sanitized = iteratee(value, key);

    if (sanitized !== null) acc[key] = sanitized;

    return acc;
  }, {});
};
