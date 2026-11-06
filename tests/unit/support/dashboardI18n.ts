import english from '@/locales/en/translation.json';
import { walletHomeMessages } from '@/locales/walletHomeMessages';
import { dashboardMessages } from '@/portfolio/dashboard/messages';

const messages: Record<string, unknown> = {
  ...english,
  ...walletHomeMessages['en-EN'],
  portfolioDashboard: dashboardMessages['en-EN'],
};

function lookup(key: string): string | undefined {
  let value: unknown = messages;

  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[part];
  }

  return typeof value === 'string' ? value : undefined;
}

const fill = (text: string, values: Record<string, unknown> = {}): string =>
  text.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));

/** The messages the dashboard shows, in English, with vue-i18n's named values and its one-or-many plural choice. */
export const dashboardI18n = {
  t: (key: string, values: Record<string, unknown> = {}): string => fill(lookup(key) ?? key, values),
  tc: (key: string, choice = 1, values: Record<string, unknown> = {}): string => {
    const text = lookup(key) ?? key;
    const choices = text.split('|').map((choiceText) => choiceText.trim());

    return fill(choices.length > 1 ? choices[choice === 1 ? 0 : 1] : text, values);
  },
};
