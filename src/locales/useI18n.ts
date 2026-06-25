import { useI18n as useVueI18n } from 'vue-i18n';

export function useI18n() {
  const composer = useVueI18n({ useScope: 'global' });

  return {
    ...composer,
    tc: (key: string, choice?: number, values?: Record<string, unknown>) => composer.t(key, choice ?? 1, values ?? {}),
  };
}
