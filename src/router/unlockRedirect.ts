import type { LocationQueryValue } from 'vue-router';

type UnlockRedirectValue = LocationQueryValue | LocationQueryValue[] | undefined;

export const resolveUnlockRedirect = (value: UnlockRedirectValue): string | undefined => {
  const candidate = Array.isArray(value) ? value[0] : value;

  return typeof candidate === 'string' && candidate.startsWith('/') && !candidate.startsWith('//')
    ? candidate
    : undefined;
};
