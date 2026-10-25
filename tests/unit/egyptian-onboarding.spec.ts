import { describe, expect, it } from 'vitest';
import { OnboardingService } from '@/extension/background/extension-base/src/services/onboarding-service';
import { EGYPTIAN_HIEROGLYPH_LOCALE } from '@/locales/languages';

const containsHieroglyph = (value: string): boolean => /[\u{13000}-\u{1342F}]/u.test(value);
const accountAnchor = '𓇋𓊪𓏥 𓈖 𓂋𓈖';
const passwordAnchor = '𓂋𓈖 𓈙𓇾𓍔𓄿𓏴𓏛';

describe('Classical Middle Egyptian onboarding', () => {
  it('uses complete local stories instead of silently falling back to English', () => {
    const service = new OnboardingService();
    const stories = service.getStories(EGYPTIAN_HIEROGLYPH_LOCALE);

    expect(stories).toHaveLength(5);
    expect(
      stories.every(({ title, description }) => containsHieroglyph(title) && containsHieroglyph(description))
    ).toBe(true);
    expect(stories.every(({ image }) => image.endsWith('.svg'))).toBe(true);
    expect(stories.map(({ title, description }) => `${title} ${description}`).join('\n')).toContain(accountAnchor);
  });

  it('covers the returning-user migration stories', () => {
    const service = new OnboardingService();
    service.changeUserType('regular');

    const stories = service.getStories(EGYPTIAN_HIEROGLYPH_LOCALE);

    expect(stories).toHaveLength(4);
    expect(
      stories.every(({ title, description }) => containsHieroglyph(title) && containsHieroglyph(description))
    ).toBe(true);
    expect(stories.map(({ title, description }) => `${title} ${description}`).join('\n')).toContain(passwordAnchor);
    expect(stories.at(-1)?.title).toBe('𓐍𓏏 𓈖𓃀 𓅓 𓋴𓏏𓆑');
  });
});
