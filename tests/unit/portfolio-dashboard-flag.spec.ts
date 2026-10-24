import { commonViteConfig, makeDefine, portfolioDashboardBuildFlag } from '../../vite.config.shared.mjs';
import { PORTFOLIO_DASHBOARD_ENABLED } from '@/portfolio/dashboard/dashboardFlag';

describe('portfolio dashboard flag', () => {
  it('is on in every build unless the build says exactly false', () => {
    for (const flag of [undefined, '', 'true', '1', 'TRUE', 'yes', ' false', 'False']) {
      expect(portfolioDashboardBuildFlag({ VUE_APP_PORTFOLIO_DASHBOARD: flag })).toBe('true');
    }
    expect(portfolioDashboardBuildFlag({})).toBe('true');
    expect(portfolioDashboardBuildFlag({ VUE_APP_PORTFOLIO_DASHBOARD: 'false' })).toBe('false');
  });

  it('reaches the bundle as one literal, in a release as in any other build', () => {
    const defineFor = (mode: string, flag: string | undefined) => {
      const previous = process.env.VUE_APP_PORTFOLIO_DASHBOARD;

      if (flag === undefined) delete process.env.VUE_APP_PORTFOLIO_DASHBOARD;
      else process.env.VUE_APP_PORTFOLIO_DASHBOARD = flag;
      try {
        return commonViteConfig({ mode, outDir: 'dist/test-flag', publicDir: false }).define['process.env.FW_PORTFOLIO_DASHBOARD'];
      } finally {
        if (previous === undefined) delete process.env.VUE_APP_PORTFOLIO_DASHBOARD;
        else process.env.VUE_APP_PORTFOLIO_DASHBOARD = previous;
      }
    };

    expect(defineFor('production', undefined)).toBe(JSON.stringify('true'));
    expect(defineFor('production', 'true')).toBe(JSON.stringify('true'));
    expect(defineFor('development', undefined)).toBe(JSON.stringify('true'));
    expect(defineFor('development', 'false')).toBe(JSON.stringify('false'));
    expect(makeDefine('development', { VUE_APP_PORTFOLIO_DASHBOARD: 'false' })['process.env.FW_PORTFOLIO_DASHBOARD']).toBe(JSON.stringify('false'));
  });

  it('does not leave the raw variable or the mode in the bundle for anyone to test instead', () => {
    const define = makeDefine('development', { VUE_APP_PORTFOLIO_DASHBOARD: 'true' });

    expect(define).not.toHaveProperty('process.env.VUE_APP_PORTFOLIO_DASHBOARD');
    expect(define).not.toHaveProperty('process.env.VITE_BUILD_MODE');
  });

  it('is off in unit tests, which are not bundled with the build define', () => {
    expect(PORTFOLIO_DASHBOARD_ENABLED).toBe(false);
  });
});
