import { describe, expect, it } from 'vitest';
import { OnboardingService } from '@/extension/background/extension-base/src/services/onboarding-service';
import { OLD_AKKADIAN_LOCALE } from '@/locales/languages';

describe('Old Akkadian onboarding', () => {
  it('uses complete local stories instead of silently falling back to English', () => {
    const service = new OnboardingService();
    const stories = service.getStories(OLD_AKKADIAN_LOCALE);

    expect(stories).toHaveLength(5);
    expect(stories[0]).toMatchObject({
      title: 'Paqittum eššetum ša riksātim',
      description: expect.stringContaining('Riksātum kalûšunu'),
    });
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
    expect(stories.at(-1)?.title).toBe('Kalû šaknum!');
    expect(stories.at(-1)?.description).toContain('awāt ḫasāsim');
  });
});
