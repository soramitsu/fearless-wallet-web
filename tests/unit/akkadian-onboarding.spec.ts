import { describe, expect, it } from 'vitest';
import { OnboardingService } from '@/extension/background/extension-base/src/services/onboarding-service';
import { OLD_AKKADIAN_LOCALE } from '@/locales/languages';

const containsCuneiform = (value: string): boolean => /[\u{12000}-\u{1254F}]/u.test(value);
const transliterationMarks = /[āēīūâêîûšṣṭḫʾ]/iu;
const isCuneiformStory = ({ title, description }: { title: string; description: string }) =>
  [title, description].every((text) => containsCuneiform(text) && !transliterationMarks.test(text));

describe('Old Akkadian onboarding', () => {
  it('uses complete local cuneiform stories instead of silently falling back to English', () => {
    const service = new OnboardingService();
    const stories = service.getStories(OLD_AKKADIAN_LOCALE);

    expect(stories).toHaveLength(5);
    expect(stories[0]).toMatchObject({
      title: '𒉺𒆠𒀉𒌅𒌝 𒌍𒊺𒌅𒌝 𒊭 𒊑𒅅𒊓𒋾𒅎',
      description: expect.stringContaining('𒊑𒅅𒊓𒌅𒌝 𒅗𒇻𒌑𒋗𒉡'),
    });
    expect(stories.every(isCuneiformStory)).toBe(true);
    expect(stories.every(({ image }) => image.endsWith('.svg'))).toBe(true);
    expect(stories.map(({ title, description }) => `${title} ${description}`).join(' ')).not.toContain(
      'network management'
    );
  });

  it('covers the returning-user migration stories', () => {
    const service = new OnboardingService();
    service.changeUserType('regular');

    const stories = service.getStories(OLD_AKKADIAN_LOCALE);

    expect(stories).toHaveLength(4);
    expect(stories.every(isCuneiformStory)).toBe(true);
    expect(stories.at(-1)?.title).toBe('𒅗𒇻𒌑 𒊭𒀝𒉡𒌝!');
    expect(stories.at(-1)?.description).toContain('𒀀𒉿𒀜 𒄩𒊓𒋛𒅎');
  });
});
